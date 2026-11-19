(() => { const app=__WD.app,R=app.renderer.renderer,S=app.renderer.scene,b=app.batch; app.loop.stop(); __WD.advance(1);
 const med=(f,n=200)=>{const a=[];for(let i=0;i<n;i++){const t=performance.now();f(i);a.push(performance.now()-t);}a.sort((x,y)=>x-y);return +a[n>>1].toFixed(2);};
 const yaw0=app.camera.yaw; const rows=[]; const root=S.getObjectByName("level-root");
 for(let h=0;h<4;h++){ app.camera.yaw=yaw0+h*Math.PI/2; __WD.advance(0.6);
   for(let i=0;i<20;i++)app.renderer.render();
   const on1=med(()=>app.renderer.render()); let f=1e7; const watch=med(()=>{for(let q=0;q<20;q++)b.watch(f++);})/20;
   const members=b.stats.members, out=b.stats.out;
   b.clear(); for(let i=0;i<10;i++)app.renderer.render(); const off=med(()=>app.renderer.render());
   b.build(S,root); for(let i=0;i<40;i++)app.renderer.render(); const on2=med(()=>app.renderer.render());
   rows.push({h,on:[on1,on2],off,watch,members,out}); }
 return rows; })()
