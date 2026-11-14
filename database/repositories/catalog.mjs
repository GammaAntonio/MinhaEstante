const editions = {id:"id",title:"title",language:"language",publishedDate:"published_date",pageCount:"page_count",publishers:"publishers",isbn10:"isbn10",isbn13:"isbn13"};
const tracks = {id:"id",recordingId:"recording_id",title:"title",artist:"artist",disc:"disc",position:"position",durationMs:"duration_ms",durationFormatted:"duration_formatted"};
export const listField = category => category === "lists" ? "bookIds" : category === "album_lists" ? "albumIds" : null;
const object = v => v && typeof v === "object" && !Array.isArray(v);
export async function saveSnapshot(query, id, value) {
  if (!object(value)) return false;
  const metadata = {...value};
  for (const field of ["authors","editions","tracks"]) if (Array.isArray(metadata[field])) metadata[field]=[];
  await query("INSERT INTO catalog_snapshots VALUES($1,$2,$3,$4)",[...id,JSON.stringify(metadata)]);
  for(const [i,name] of (Array.isArray(value.authors) ? value.authors : []).entries()){
    if(typeof name!=="string") throw Error("Autor inválido");
    await query("INSERT INTO authors VALUES($1) ON CONFLICT DO NOTHING",[name]);
    await query("INSERT INTO snapshot_authors VALUES($1,$2,$3,$4,$5)",[...id,i,name]);
  }
  for(const [field,mapping] of [["editions",editions],["tracks",tracks]]){
    if(!Array.isArray(value[field])) continue;
    for(const [i,entry] of value[field].entries()){
      if(!object(entry)) throw Error("Registro inválido em "+field);
      const extra={...entry};
      const values=Object.keys(mapping).map(key=>{
        const current=extra[key];
        if(current != null) delete extra[key];
        return current ?? null;
      });
      const args=[...id,i,...values,JSON.stringify(extra)];
      await query("INSERT INTO snapshot_"+field+" VALUES("+args.map((_,i)=>"$"+(i+1)).join(",")+")",args);
    }
  }
  return true;
}
function children(table,mapping){
  const fields=Object.entries(mapping).map(([key,col])=>"'"+key+"',"+col).join(",");
  return "(SELECT jsonb_agg(metadata || jsonb_strip_nulls(jsonb_build_object("+fields+")) ORDER BY ordinal) FROM snapshot_"+table+
    " WHERE (user_id,scope,record_key)=(s.user_id,s.scope,s.record_key)) AS "+table;
}
export const snapshotSQL = "(SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT scope,record_key,metadata,"+
  "(SELECT jsonb_agg(name ORDER BY ordinal) FROM snapshot_authors WHERE (user_id,scope,record_key)=(s.user_id,s.scope,s.record_key)) AS authors,"+
  children("editions",editions)+","+children("tracks",tracks)+" FROM catalog_snapshots s WHERE user_id=u.id) x) AS snapshots";

export function hydrateSnapshots(user, rows){
  for(const {scope,record_key:key,metadata,authors,editions,tracks} of rows||[]){
    if(authors) metadata.authors=authors;
    if(editions) metadata.editions=editions;
    if(tracks) metadata.tracks=tracks;
    if(scope==="library") user.library[key].book=metadata;
    else if(scope==="album_library") user.albums.library[key].album=metadata;
    else Object.defineProperty(user.albums.snapshots,key,{value:metadata,enumerable:true,writable:true,configurable:true});
  }
}

