(async () => { const app=__WD.app, R=app.renderer.renderer, gl=R.getContext(), b=app.batch;
 const before=JSON.stringify(b.stats);
 await app.switchStyle('desert'); await new Promise(r=>setTimeout(r,500));
 app.loop.stop(); __WD.advance(0.5);
 const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight;
 const grab=()=>{app.renderer.render(); const px=new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px); return px;};
 const setB=(on)=>{b.reveal(!on); for(const x of b.batches)x.mesh.visible=on;};
 const cmp=(x,y)=>{let n2=0,mx=0;for(let i=0;i<x.length;i+=4){const d=Math.max(Math.abs(x[i]-y[i]),Math.abs(x[i+1]-y[i+1]),Math.abs(x[i+2]-y[i+2]));if(d>2)n2++;if(d>mx)mx=d;}return {n2,mx};};
 const yaw0=app.camera.yaw; const rows=[];
 for(let h=0;h<4;h++){ app.camera.yaw=yaw0+h*1.57; __WD.advance(0.5); setB(true); const a=grab(); const a2=grab(); setB(false); const s=grab(); setB(true); rows.push({noise:cmp(a,a2),diff:cmp(a,s)}); }
 return {before,after:b.stats,style:document.body.dataset.style,rows}; })()
