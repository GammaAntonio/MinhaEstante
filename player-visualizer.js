export function drawAurora(ctx, time, energy, texture) {
  const { width, height } = ctx.canvas;
  const phase = time * 0.63;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#060b21";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "screen";

  for (let ribbon = 0; ribbon < 4; ribbon++) {
    const drift = phase + ribbon * 1.61;
    const colors = [193, 153, 267, 227];
    const glow = ctx.createLinearGradient(0, 0, width, height);
    glow.addColorStop(0, `hsla(${colors[ribbon]}, 98%, 45%, 0)`);
    glow.addColorStop(0.55, `hsla(${colors[ribbon]}, 98%, 57%, ${0.36 + energy * 0.25})`);
    glow.addColorStop(1, `hsla(${colors[ribbon]}, 98%, 45%, 0)`);
    ctx.strokeStyle = glow;
    for (let lane = 0; lane < 7; lane++) {
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const angle = i / 64 * Math.PI * 2;
        const radius = 0.25 + Math.sin(angle * 3 + drift) * (0.07 + energy * 0.085) +
          Math.cos(angle * 5 - drift + lane * 0.22) * (0.025 + texture * 0.05);
        const x = width * (0.73 + Math.cos(angle + drift * 0.42) * radius * (1.45 + lane * 0.045));
        const y = height * (0.5 + Math.sin(angle + drift * 0.42) * radius * (1.45 + lane * 0.11));
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.lineWidth = lane === 0 ? 5 : 0.9;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

export const visualModes = {
  auto:"Automático", ambience:"Ambience", plenoptic:"Plenoptic", spectrum:"Spectrum",
  cosmic:"Cosmic", oscilloscope:"Oscilloscope", pulse:"Pulse", electric:"Electric",
  kaleidoscope:"Kaleidoscope", album:"Album Color", off:"Desativado",
};

export function drawPreset(ctx, mode, time, signal, intensity, hue) {
  const {width:w,height:h}=ctx.canvas;
  const {bass,mid,treble,wave,frequency}=signal;
  if(mode==="ambience") { drawAurora(ctx,time,bass*intensity,mid);return; }
  ctx.fillStyle="#080d1d";ctx.fillRect(0,0,w,h);
  ctx.lineWidth=2;
  if(mode==="spectrum"){
    for(let i=0;i<40;i++){
      const level=(frequency?.[i*4]||0)/255*intensity;
      ctx.fillStyle=`hsl(${175+i*3} 78% 62%)`;
      ctx.fillRect(i*w/40,h-level*h*.86,w/48,Math.max(2,level*h*.86));
    }
    return;
  }
  if(mode==="oscilloscope" || mode==="electric"){
    ctx.strokeStyle=mode==="electric"?"#69aaff":"#8bf3bc";
    ctx.beginPath();
    for(let i=0;i<128;i++){
      const sample=(wave?.[i*4]??128)-128;
      const y=h/2+sample/128*h*.38*intensity;
      if(!i)ctx.moveTo(0,y);else ctx.lineTo(i*w/127,y);
    }
    ctx.stroke();return;
  }
  if(mode==="cosmic"){
    for(let i=0;i<72;i++){
      const angle=i*2.39996+time*.13, radius=((i*.073+time*.06)%1)*h*.78;
      ctx.fillStyle=`hsla(${190+i%55} 79% 72% / ${.25+treble*.6})`;
      ctx.beginPath();ctx.arc(w/2+Math.cos(angle)*radius,h/2+Math.sin(angle)*radius,1+mid*8*intensity,0,Math.PI*2);ctx.fill();
    }
    return;
  }
  for(let ring=0;ring<10;ring++){
    const corners=mode==="kaleidoscope"?6:mode==="plenoptic"?4:60;
    const phase=time*(mode==="plenoptic"?.65:.24)+ring*.14;
    const radius=(ring+1)*h/24*(1+bass*.75*intensity);
    ctx.strokeStyle=`hsla(${(mode==="album"?hue:182)+ring*10} 82% 66% / ${.24+mid*.55})`;
    ctx.beginPath();
    for(let point=0;point<=corners;point++){
      const angle=point/corners*Math.PI*2+phase;
      const extent=radius*(1+Math.sin(angle*6+time)*treble*.6);
      if(!point)ctx.moveTo(w/2+Math.cos(angle)*extent,h/2+Math.sin(angle)*extent);
      else ctx.lineTo(w/2+Math.cos(angle)*extent,h/2+Math.sin(angle)*extent);
    }
    ctx.stroke();
  }
}
