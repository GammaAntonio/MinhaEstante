import { saveSnapshot, listField, snapshotSQL, hydrateSnapshots } from "./catalog.mjs";
import { isDeepStrictEqual } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

export function createRepository() {
  const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
  pool.on("error", error => console.error("PostgreSQL:", error.code || error.name));
  const context = new AsyncLocalStorage();
  const query = (sql, args) => (context.getStore() || pool).query(sql,args);
  async function transaction(task, { dryRun = false } = {}) {
    if (context.getStore()) return task();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(7284183)");
      const result = await context.run(client, task);
      await client.query(dryRun ? "ROLLBACK" : "COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  const arrayKeys = ["reviews","lists","journal","posts","activity","album_reviews","album_lists"];
  const objectKeys = ["ratings","album_ratings","album_trackRatings","album_audio","album_snapshots"];
  const fields = [...arrayKeys,...objectKeys,"library","album_library"];
  function slot(user,key) {
    return key.startsWith("album_") ? [user.albums,key.slice(6)] : [user,key];
  }
  async function saveUser(user, ordinal) {
    const core = structuredClone(user);
    for (const key of ["id","username","role"]) delete core[key];
    const profiles = [];
    if (core.page && typeof core.page === "object") {
      for (const media of ["books","albums"]) {
        if (Object.hasOwn(core.page.mediaPages || {},media)) {
          profiles.push([media,core.page.mediaPages[media]]);
          delete core.page.mediaPages[media];
        }
      }
      profiles.push(["legacy",core.page]);
      delete core.page;
    }
    const records = [];
    for (const key of fields) {
      const [host,property] = slot(core,key);
      const values = host?.[property];
      const array = arrayKeys.includes(key) || key.endsWith("library");
      if (array ? !Array.isArray(values) : !values || typeof values !== "object" || Array.isArray(values)) continue;
      records.push([key,Object.entries(values)]);
      host[property] = array ? [] : {};
    }
    await query("INSERT INTO users VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET username=excluded.username,role=excluded.role,ordinal=excluded.ordinal,metadata=excluded.metadata",
      [user.id,user.username,user.role ?? null,ordinal,JSON.stringify(core)]);
    for (const table of ["profiles","library_entries","album_entries","user_records","catalog_snapshots"])
      await query(`DELETE FROM ${table} WHERE user_id=$1`,[user.id]);
    for (const [media,profile] of profiles)
      await query("INSERT INTO profiles VALUES ($1,$2,$3)",[user.id,media,JSON.stringify(profile)]);
    for (const [category,entries] of records) {
      for (const [index,[key,value]] of entries.entries()) {
        if (category === "library" || category === "album_library") {
          const book = category === "library";
          const id = book ? value?.bookId : value?.albumId;
          if (typeof id !== "string" || !id) throw Error("Entrada de coleção sem identificador válido");
          await query(`INSERT INTO ${book ? "works" : "albums"} VALUES ($1) ON CONFLICT DO NOTHING`,[id]);
          const metadata={...value};
          const property=book ? "book" : "album";
          if(await saveSnapshot(query,[user.id,category,key],value[property])) delete metadata[property];
          await query(`INSERT INTO ${book ? "library_entries" : "album_entries"} VALUES ($1,$2,$3,$4)`,[user.id,index,id,JSON.stringify(metadata)]);
        } else {
          if(category==="album_snapshots" && await saveSnapshot(query,[user.id,category,key],value)) continue;
          const field=listField(category);
          const items=field && value?.[field];
          const metadata=Array.isArray(items) ? {...value,[field]:[]} : value;
          await query("INSERT INTO user_records VALUES ($1,$2,$3,$4,$5)",[user.id,category,key,index,JSON.stringify(metadata)]);
          if(Array.isArray(items)) for(const [ordinal,item] of items.entries()){
            if(typeof item!=="string" || !item) throw Error("Item de lista sem identificador válido");
            const book=category==="lists";
            await query("INSERT INTO "+(book?"works":"albums")+" VALUES($1) ON CONFLICT DO NOTHING",[item]);
            await query("INSERT INTO list_items VALUES($1,$2,$3,$4,$5,$6)",[user.id,category,key,ordinal,book?item:null,book?null:item]);
          }
        }
      }
    }
  }
  async function readUsers({ legacy = false, userId = null } = {}) {
    // One statement gives every collection the same PostgreSQL snapshot.
    const {rows} = await query(`SELECT u.id,u.username,u.role,u.metadata,
      (SELECT jsonb_object_agg(media,configuration) FROM profiles WHERE user_id=u.id) AS profiles,
      (SELECT jsonb_agg(metadata ORDER BY ordinal) FROM library_entries WHERE user_id=u.id) AS books,
      (SELECT jsonb_agg(metadata ORDER BY ordinal) FROM album_entries WHERE user_id=u.id) AS albums,
      (SELECT jsonb_agg(jsonb_build_array(category,record_key,metadata${legacy ? "" : ", (SELECT jsonb_agg(coalesce(work_id,album_id) ORDER BY li.ordinal) FROM list_items li WHERE (li.user_id,li.category,li.record_key)=(r.user_id,r.category,r.record_key))"}) ORDER BY ordinal) FROM user_records r WHERE user_id=u.id) AS records,
      ${legacy ? "NULL AS snapshots" : snapshotSQL}
      FROM users u ${userId === null ? "" : "WHERE u.id = $1"} ORDER BY ordinal`,
    userId === null ? [] : [userId]);
    return rows.map(row => {
      const user={...row.metadata,id:row.id,username:row.username};
      if(row.role !== null) user.role=row.role;
      if (row.profiles) {
        const {legacy,books,albums}=row.profiles;
        user.page=legacy;
        if (Object.hasOwn(row.profiles,"books") || Object.hasOwn(row.profiles,"albums")) {
          user.page.mediaPages ??= {};
          if (Object.hasOwn(row.profiles,"books")) user.page.mediaPages.books=books;
          if (Object.hasOwn(row.profiles,"albums")) user.page.mediaPages.albums=albums;
        }
      }
      if(row.books) user.library=row.books;
      if(row.albums) user.albums.library=row.albums;
      for(const [category,key,value,items] of row.records || []) {
        const [host,property]=slot(user,category);
        if(items) value[listField(category)]=items;
        Object.defineProperty(host[property],key,{value,enumerable:true,writable:true,configurable:true});
      }
      hydrateSnapshots(user,row.snapshots);
      return user;
    });
  }
  const extras = (value, fields) => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key))));
  const tables = {
    auth: { name:"credentials", select: "metadata || jsonb_build_object('userId',user_id,'username',username,'passwordHash',password_hash)", values: (v,i)=>[v.userId,v.username,v.passwordHash,i,extras(v,["userId","username","passwordHash"])] },
    accounts: {name:"accounts",values:(v,i)=>[v.userId,v.email ?? null,i,JSON.stringify(v)]},
    friendships: {name:"friendships", select: "metadata || jsonb_build_object('id',id,'requesterId',requester_id,'receiverId',receiver_id,'status',status)", values:(v,i)=>[v.id,v.requesterId,v.receiverId,v.status,i,extras(v,["id","requesterId","receiverId","status"])]},
  };
  async function read(kind) {
    if(kind==="users") return readUsers();
    return (await query(`SELECT ${tables[kind].select || "metadata"} AS metadata FROM ${tables[kind].name} ORDER BY ordinal`)).rows.map(x=>x.metadata);
  }
  async function write(kind, values) {
    if(kind==="users") {
      const existing = new Map((await readUsers()).map((record,index)=>[record.id,[record,index]]));
      for(const [index,user] of values.entries()) {
        const prior=existing.get(user.id);
        if(!prior || prior[1]!==index || !isDeepStrictEqual(prior[0],user)) await saveUser(user,index);
      }
      await query("DELETE FROM users WHERE NOT (id = ANY($1::text[]))",[values.map(v=>v.id)]);
      return;
    }
    const {name,values:encode}=tables[kind];
    await query(`DELETE FROM ${name}`);
    for(const [index,item] of values.entries()) {
      const args=encode(item,index);
      await query(`INSERT INTO ${name} VALUES (${args.map((_,i)=>"$"+(i+1)).join(",")})`,args);
    }
  }
  return { query, transaction, read, write, readUsers, saveUser, close:()=>pool.end() };
}
