import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepository } from "../database/repositories/persistence.mjs";

test("normaliza e reconstrói autor, edição, faixa e posição de listas", {
  skip: process.env.MINHAESTANTE_TEST_DB !== "1",
}, async () => {
  const repository = createRepository();
  const user = {
    id: "integration-normalized", username: "integration-normalized",
    library: [{bookId:"OL90W",book:{id:"OL90W",authors:["Autora B","Autora A"],
      editions:[{id:"OL9M",title:"Primeira",pageCount:null,isbn13:[],extra:true}]}}],
    lists: [{id:"reading-list",bookIds:["OL90W","OL91W"]}],
    albums:{
      library:[{albumId:"musicbrainz-test",album:{id:"musicbrainz-test",authors:["Artista"]}}],
      snapshots:{"musicbrainz-test":{id:"musicbrainz-test",tracks:[
        {id:"track-test",recordingId:"recording-test",title:"Faixa",durationMs:1000,disc:1,position:1},
      ]}},
      lists:[{id:"listening-list",albumIds:["musicbrainz-other","musicbrainz-test"]}],
    },
  };
  try {
    await repository.transaction(async () => {
      await repository.saveUser(user,999);
      assert.deepEqual((await repository.read("users")).find(x=>x.id===user.id),user);
      const {rows}=await repository.query(`SELECT
       (SELECT count(*) FROM snapshot_authors WHERE user_id=$1)::int AS authors,
       (SELECT count(*) FROM snapshot_editions WHERE user_id=$1)::int AS editions,
       (SELECT count(*) FROM snapshot_tracks WHERE user_id=$1)::int AS tracks,
       (SELECT count(*) FROM list_items WHERE user_id=$1)::int AS items`,[user.id]);
      assert.deepEqual(rows[0],{authors:3,editions:1,tracks:1,items:4});
      assert.equal((await repository.query("SELECT metadata->'tracks' AS tracks FROM catalog_snapshots WHERE user_id=$1 AND scope='album_snapshots'",[user.id])).rows[0].tracks.length,0);
    },{dryRun:true});
    assert.equal((await repository.read("users")).some(x=>x.id===user.id),false);
  } finally {
    await repository.close();
  }
});
