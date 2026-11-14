import { h, button, link, field, select, guarded, notify } from "./ui.js";
import { uploadPageAsset } from "./page-assets.js";
import { cleanStickers, MAX_STICKERS } from "./sticker-data.js";

const categories = {
  "Pixel art": "pixel", Literatura: "book", Música: "music", Tecnologia: "computer",
  "Emo e indie": "heart", Estrelas: "star", Retrô: "cassette", Câmeras: "camera",
  Videogames: "game", Emojis: "smile", Molduras: "frame", Selos: "badge",
  Y2K: "disk", Natureza: "flower", Geometria: "triangle",
};
function graphic(item) {
  const src = item.src.includes(":") ? `https://api.iconify.design/${item.src.replace(":", "/")}.svg` : item.src;
  return h("img", { src, alt: "", draggable: "false", referrerpolicy: "no-referrer" });
}
export function stickerLayer(values) {
  const items = cleanStickers(values);
  if (!items.length) return null;
  return h("div", { class: "sticker-layer", "aria-hidden": "true" },
    items.map(item => h("span", { class: "sticker-position", style:
      `left:${item.x}%;top:${item.y}%;width:${item.size}%;opacity:${item.opacity};transform:translate(-50%,-50%) rotate(${item.angle}deg)` }, graphic(item))));
}
export function stickerCredits(values) {
  const items = cleanStickers(values);
  return h("small", { class: "sticker-credits" },
    items.some(x => x.src.startsWith("openmoji:")) && link("OpenMoji · CC BY-SA 4.0", "https://openmoji.org/"),
    items.some(x => x.src.startsWith("pixelarticons:")) && link("Pixelarticons · MIT", "https://github.com/halfmage/pixelarticons"));
}

export function stickerEditor(draft, history) {
  let items = cleanStickers(draft.stickers), selected = items.length - 1;
  const board = h("div", { class: "sticker-board" });
  const controls = h("div"), results = h("div", { class: "sticker-results" });
  const status = h("p", { role: "status" });
  const write = () => { draft.stickers = cleanStickers(items); };
  const remember = () => {
    history.undo.push(structuredClone(items));
    if (history.undo.length > 40) history.undo.shift();
    history.redo.length = 0;
  };
  const commit = (change) => { remember(); change(); write(); draw(); };
  const add = (src) => {
    if (items.length >= MAX_STICKERS) throw new Error("Limite de 24 adesivos.");
    const [item] = cleanStickers([{src}]);
    if (!item) throw new Error("Imagem incompatível.");
    commit(() => { selected = items.push(item) - 1; });
  };
  function draw() {
    board.replaceChildren(stickerLayer(items));
    controls.replaceChildren(
      h("div", { class: "toolbar" },
        button("Desfazer", () => step(history.undo, history.redo)),
        button("Refazer", () => step(history.redo, history.undo)),
        button("Restaurar publicados", () => commit(() => {
          items = cleanStickers(history.initial); selected = items.length - 1;
        }))));
    if (!items.length) return;
    selected = Math.max(0, Math.min(selected, items.length - 1));
    const picker = select("sticker", Object.fromEntries(items.map((x,i) => [i, `${i+1} · ${x.src.includes(":") ? x.src.split(":")[1] : "Imagem enviada"}`])), selected);
    picker.addEventListener("change", () => { selected = Number(picker.value); draw(); });
    const item = items[selected];
    const patch = (key,value) => commit(() => { item[key] = value; });
    const slider = (label,key,min,max,step = 1) => {
      const input = h("input", {type:"range",min,max,step,value:item[key],disabled:item.locked && key !== "opacity"});
      input.addEventListener("change", () => patch(key, Number(input.value)));
      return field(label,input);
    };
    controls.append(field("Adesivo selecionado",picker),
      slider("Posição horizontal","x",0,100), slider("Posição vertical","y",0,100),
      slider("Tamanho","size",4,35), slider("Rotação","angle",-180,180), slider("Opacidade","opacity",0.15,1,0.05),
      h("div",{class:"toolbar"},
        button(item.locked ? "Desbloquear" : "Bloquear",()=>patch("locked",!item.locked)),
        button("Centralizar",()=>{if(!item.locked) commit(()=>{ item.x=50;item.y=50; });}),
        button("Duplicar",()=>{if(items.length < MAX_STICKERS) commit(()=>{selected=items.push({...item,locked:false})-1;});}),
        button("Trazer à frente",()=>commit(()=>{items.push(items.splice(selected,1)[0]);selected=items.length-1;})),
        button("Enviar para trás",()=>commit(()=>{items.unshift(items.splice(selected,1)[0]);selected=0;})),
        button("Excluir",()=>commit(()=>items.splice(selected,1)))));
    board.querySelectorAll(".sticker-position").forEach((node,i)=>{
      node.classList.toggle("sticker-selected",i===selected);
      node.addEventListener("pointerdown",event=>{
        if(event.button!==0) return;
        event.preventDefault();
        selected=i;
        const target=items[i];
        if(target.locked){draw();return;}
        const rect=board.getBoundingClientRect(), startX=event.clientX, startY=event.clientY;
        const initialX=target.x,initialY=target.y;
        let moved=false;
        node.setPointerCapture(event.pointerId);
        const move=e=>{
          if(!moved){remember();moved=true;}
          target.x=Math.max(0,Math.min(100,initialX+(e.clientX-startX)/rect.width*100));
          target.y=Math.max(0,Math.min(100,initialY+(e.clientY-startY)/rect.height*100));
          node.style.left=target.x+"%";node.style.top=target.y+"%";
        };
        node.addEventListener("pointermove",move);
        node.addEventListener("lostpointercapture",()=>{write();draw();},{once:true});
      });
    });
  }
  function step(from,to){
    if(!from.length) return;
    to.push(structuredClone(items));items=from.pop();write();draw();
  }
  const category=select("category",Object.fromEntries(Object.keys(categories).map(x=>[x,x])),"Literatura");
  const term=h("input",{type:"search",maxlength:70});
  const form=h("form",{},field("Categoria",category),field("Pesquisar adesivos",term),
    h("button",{type:"submit"},"Buscar na Iconify"));
  let request;
  form.addEventListener("submit",guarded(async event=>{
    event.preventDefault();
    request?.abort();
    const current=new AbortController();
    request=current;
    status.textContent="Buscando…";results.replaceChildren();
    const query=new URLSearchParams({query:term.value.trim() || categories[category.value],prefixes:"pixelarticons,openmoji",limit:"32"});
    try{
      const response=await fetch("https://api.iconify.design/search?"+query,{signal:current.signal});
      if(!response.ok) throw Error("Falha na Iconify");
      const {icons}=await response.json();
      if(current.signal.aborted) return;
      const found=cleanStickers(icons.map(src=>({src})));
      status.textContent=found.length ? `${found.length} adesivos` : "Nenhum adesivo encontrado.";
      results.replaceChildren(...found.map(item=>{
        const control=button(graphic(item),()=>add(item.src));
        control.setAttribute("aria-label","Adicionar "+item.src);
        return control;
      }));
    }catch{if(!current.signal.aborted) status.textContent="Busca indisponível. Você pode enviar uma imagem ou usar os adesivos abaixo.";}
  }));
  const upload=h("input",{type:"file",accept:"image/png,image/webp,image/jpeg,image/gif"});
  upload.addEventListener("change",guarded(async ()=>{
    const file=upload.files[0]; if(!file) return;
    if(items.length>=MAX_STICKERS) throw Error("Limite de 24 adesivos.");
    const image=await createImageBitmap(file);
    const valid=image.width<=4096 && image.height<=4096;image.close();
    if(!valid) throw Error("A imagem deve ter até 4096 × 4096 pixels.");
    const result=await uploadPageAsset(file);
    add(result.url || result.asset?.url);
    upload.value="";notify("Imagem adicionada ao rascunho.");
  }));
  const starter=["pixelarticons:book-open","pixelarticons:heart","openmoji:1f4bf","openmoji:1f4f7"].map(src=>{
    const control=button(graphic({src}),()=>add(src));control.setAttribute("aria-label","Adicionar "+src);return control;
  });
  draw();
  return h("section",{class:"sticker-editor"},form,status,results,
    h("div",{class:"sticker-results"},starter),field("Enviar imagem própria",upload),
    board,controls,stickerCredits(starter.map((_,i)=>({src:["pixelarticons:book-open","pixelarticons:heart","openmoji:1f4bf","openmoji:1f4f7"][i]}))));
}
