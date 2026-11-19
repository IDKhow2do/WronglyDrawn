(() => { const app=__WD.app,S=app.renderer.scene,b=app.batch; app.loop.stop(); __WD.advance(1);
 const before=new Set(b.members.map(m=>m.mesh)); const root=S.getObjectByName("level-root"); const s0=JSON.stringify(b.stats);
 b.clear(); b.build(S,root); const after=new Set(b.members.map(m=>m.mesh)); const rows={};
 for(const o of before){ if(after.has(o)) continue; const mat=Array.isArray(o.material)?o.material[0]:o.material; let hid=null; for(let p=o;p;p=p.parent) if(!p.visible){hid=p.name||p.type;break;}
   let top=o; while(top.parent&&top.parent!==root) top=top.parent;
   const k=(hid?"hidden@"+hid:mat.transparent?"transparent":Object.prototype.hasOwnProperty.call(mat,"onBeforeCompile")?"patched(painted)":mat.defines&&("WD_ACTOR" in mat.defines)?"actor":"other")+" top="+(top.name||top.type)+"["+Object.keys(top.userData).join(",")+"]"+(o.userData.isOutline?" outline":""); rows[k]=(rows[k]||0)+1; }
 return {s0,s1:b.stats,lost:Object.entries(rows).sort((a,b)=>b[1]-a[1]).slice(0,12)}; })()
