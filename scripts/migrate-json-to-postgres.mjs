import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createRepository } from "../database/repositories/persistence.mjs";
const args=process.argv.slice(2);
const verify=args.includes("--verify");
const dryRun=args.includes("--dry-run");
const root=resolve(args.find(x=>!x.startsWith("--")) || "data");
const kinds=["users","auth","accounts","friendships"];
const source=Object.fromEntries(await Promise.all(kinds.map(async k=>[k,JSON.parse(await readFile(join(root,k+".json"),"utf8"))])));
for(const kind of kinds){
 const key=kind==="users"||kind==="friendships"?"id":"userId";
 if(!Array.isArray(source[kind]) || source[kind].some(v=>typeof v?.[key]!=="string"||!v[key]) ||
 new Set(source[kind].map(v=>v[key])).size!==source[kind].length) throw Error("Identificadores inválidos ou duplicados em "+kind);
}
if(source.users.some(u=>u.password||u.passwordHash)) throw Error("Credenciais legadas embutidas exigem tratamento antes da importação.");
const session=(await readFile(join(root,"session-secret"),"utf8")).trim();
if(!/^[0-9a-f]{64}$/i.test(session)) throw Error("Segredo de sessão inválido.");
const creator=JSON.parse(await readFile(join(root,"creator.json"),"utf8")).userId;
const files=[];
for(const [directory,kind] of [["audio","audio"],["page-assets","image"]]){
 for(const item of await readdir(join(root,directory),{recursive:true,withFileTypes:true})){
  if(item.isSymbolicLink()) throw Error("Link simbólico inesperado em "+directory);
  if(!item.isFile()) continue;
  const absolute=join(item.parentPath,item.name);
  files.push([absolute.slice(root.length+1).replaceAll("\\","/"),kind,(await stat(absolute)).size]);
 }
}
const available=new Set(files.map(x=>x[0]));
function references(value){
 if(typeof value==="string"){
  if(/^server:[a-f0-9-]{36}$/i.test(value) && !available.has("audio/"+value.slice(7)+".mp3")) throw Error("Referência de áudio sem arquivo");
  if(value.startsWith("/api/persistence/page-assets/file/") && !available.has("page-assets/"+decodeURIComponent(value.slice(34)))) throw Error("Referência de imagem sem arquivo");
 } else if(value && typeof value==="object") for(const child of Object.values(value)) references(child);
}
references(source.users);
const db=createRepository();
try{
 await db.transaction(async()=>{
  const installed=await db.query("SELECT to_regclass('public.app_state') AS table_name");
  if(!installed.rows[0].table_name) await db.query(await readFile(new URL("../database/migrations/001-initial.sql",import.meta.url),"utf8"));
  const schema=await db.query("SELECT to_regclass('public.catalog_snapshots') AS normalized");
  if (!schema.rows[0].normalized) {
    if (verify) throw Error("Migration 002 pendente");
    const legacy=await db.readUsers({legacy:true});
    await db.query(await readFile(new URL("../database/migrations/002-normalized-catalog.sql",import.meta.url),"utf8"));
    for (const [index,user] of legacy.entries()) await db.saveUser(user,index);
    if(!isDeepStrictEqual(await db.read("users"),legacy)) throw Error("Divergência na atualização do esquema");
  }
  const {rows}=await db.query("SELECT session_secret, creator_id FROM app_state");
  if(!rows.length && !verify){
   for(const kind of kinds) await db.write(kind,source[kind]);
   await db.query("INSERT INTO app_state(session_secret,creator_id) VALUES($1,$2)",[session,creator]);
   for(const file of files) await db.query("INSERT INTO media_files VALUES($1,$2,$3)",file);
  }else if(rows[0]?.session_secret!==session || rows[0]?.creator_id!==creator) throw Error("Identidade ou sessão divergente");
  await db.query("SET CONSTRAINTS ALL IMMEDIATE");
  for(const kind of kinds) if(!isDeepStrictEqual(await db.read(kind),source[kind])) throw Error("Divergência em "+kind);
  const existing=(await db.query("SELECT path,kind,size_bytes FROM media_files")).rows.map(v=>[v.path,v.kind,Number(v.size_bytes)]);
  if(!isDeepStrictEqual(existing.sort(),files.sort())) throw Error("Inventário de mídia divergente");
 },{dryRun});
 console.log(JSON.stringify({mode:verify?"verify":dryRun?"dry-run":"import",counts:Object.fromEntries(kinds.map(k=>[k,source[k].length])),media:files.length,result:"PARITY_OK"}));
}finally{await db.close();}
