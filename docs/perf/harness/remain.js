(() => { const app=__WD.app,R=app.renderer.renderer; app.loop.stop(); __WD.advance(0.3);
 const rbd=R.renderBufferDirect; const rows=new Map(); let total=0, shadowN=0;
 const memberOf=new Map(); for(const m of app.batch.members) memberOf.set(m.mesh,m);
 R.renderBufferDirect=function(cam,scene,geo,mat,obj,grp){ const shadow=scene===null||mat.isMeshDepthMaterial; if(shadow){shadowN++;} else { total++;
   let dyn=false, top=obj; for(let p=obj;p&&p.name!=="level-root";p=p.parent){ if(p.userData.paintDynamic) dyn=true; top=p; }
   let cls;
   if(obj.userData.wdBatch) cls="BATCH";
   else if(obj.isSprite) cls="sprite";
   else if(obj.isLine) cls="line";
   else if(dyn) cls="dynamic(paintDynamic) "+(obj.userData.isOutline?"outline":mat.transparent?"transparent":"opaque");
   else if(memberOf.has(obj)) { const m=memberOf.get(obj); cls="member-out "+(obj.material!==m.mat?"material-swapped":"moved/hidden"); }
   else if(mat.transparent) cls="transparent "+mat.type+(mat.map?" map":"")+" side"+mat.side+(mat.forceSinglePass?" 1pass":"")+(mat.depthWrite?"":" noDepthWrite");
   else if(Array.isArray(obj.material)) cls="multi-material";
   else if(mat.isShaderMaterial) cls="shader";
   else { const g=obj.geometry; if(!g.boundingBox)g.computeBoundingBox(); const s=g.boundingBox.getSize(new (app.session.player.pos.constructor)()); const ws=obj.getWorldScale(new (app.session.player.pos.constructor)()); const ext=Math.max(s.x*Math.abs(ws.x),s.y*Math.abs(ws.y),s.z*Math.abs(ws.z));
     cls = ext>16?"big>16m": obj.userData.uniqueUv?"glb(uniqueUv)": g.attributes.position.isInterleavedBufferAttribute?"interleaved": (obj.onBeforeRender!==Object.getPrototypeOf(Object.getPrototypeOf(obj)).onBeforeRender&&obj.hasOwnProperty("onBeforeRender"))?"hook":"alone/other "+mat.type+(mat.map?" map":"");
   }
   const k=cls+" | top="+(top.name||top.type); const e=rows.get(k)||{n:0,tris:0}; e.n++; e.tris+=(grp?grp.count:geo.index?geo.index.count:geo.attributes.position.count)/3; rows.set(k,e); const c2=rows.get("#"+cls)||{n:0,tris:0}; c2.n++; c2.tris+=(grp?grp.count:geo.index?geo.index.count:geo.attributes.position.count)/3; rows.set("#"+cls,c2); }
   return rbd.apply(this,arguments); };
 app.renderer.render(); R.renderBufferDirect=rbd;
 const all=[...rows].map(([k,e])=>[e.n,Math.round(e.tris),k]).sort((a,b)=>b[0]-a[0]);
 return {total,shadowN,classes:all.filter(x=>x[2][0]==="#"),top:all.filter(x=>x[2][0]!=="#").slice(0,40)}; })()
