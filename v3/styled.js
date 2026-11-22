/* Styled Prism renderer v2: exact geometric silhouette contour.
   Quiet zone = uniform outward offset of the union of drawn hex cells,
   with arc joins at convex corners. Even width by construction. */
function styledPrism(code,r,{offset=2.0,ring=0.5,border='#e2549b',bg='#ffffff',SS=3}={}){
  const l=code.layout;
  const S3=Math.sqrt(3);
  const cells=l.cells.filter(c=>c.role!=='gap');
  const key=(i,j)=>i+','+j;
  const cellSet=new Set(cells.map(c=>key(c.i,c.j)));
  const RAD=1.03, RIN=RAD*Math.cos(Math.PI/6);
  const inHex=(px,py,c)=>{
    const dx=px-c.x,dy=py-c.y;
    for(let k=0;k<6;k++){const a=(60*k)*Math.PI/180;
      if(dx*Math.cos(a)+dy*Math.sin(a)>RIN-1e-9)return false;}
    return true;
  };
  // boundary sub-segments: sample each edge, keep uncovered parts
  const segs=[];
  const M=16;
  for(const c of cells){
    for(let k=0;k<6;k++){
      const a1=(30+60*k)*Math.PI/180,a2=(30+60*(k+1))*Math.PI/180;
      const p1=[c.x+RAD*Math.cos(a1),c.y+RAD*Math.sin(a1)];
      const p2=[c.x+RAD*Math.cos(a2),c.y+RAD*Math.sin(a2)];
      let start=null;
      for(let m=0;m<=M;m++){
        const t=m/M,px=p1[0]+(p2[0]-p1[0])*t,py=p1[1]+(p2[1]-p1[1])*t;
        let covered=false;
        for(const o of cells){if(o===c)continue;if(Math.abs(o.x-px)>2.2||Math.abs(o.y-py)>2.2)continue;
          if(inHex(px,py,o)){covered=true;break;}}
        if(!covered&&start===null)start=[px,py];
        if(covered&&start!==null){segs.push([start,[p1[0]+(p2[0]-p1[0])*(m-1)/M,p1[1]+(p2[1]-p1[1])*(m-1)/M]]);start=null;}
      }
      if(start!==null)segs.push([start,p2]);
    }
  }
  // assemble loops
  const q=p=>p[0].toFixed(3)+','+p[1].toFixed(3);
  const adj=new Map();
  for(const s of segs){
    if(!adj.has(q(s[0])))adj.set(q(s[0]),[]);
    adj.get(q(s[0])).push(s);
  }
  const used=new Set();
  const loops=[];
  for(const s0 of segs){
    if(used.has(s0))continue;
    const loop=[s0[0],s0[1]];used.add(s0);
    let guard=0;
    while(guard++<100000){
      const tail=loop[loop.length-1];
      const cands=adj.get(q(tail))||[];
      let nxt=null;
      for(const s of cands){if(used.has(s))continue;
        if(q(s[0])===q(tail)){nxt=[s,s[1]];break;}
        if(q(s[1])===q(tail)){nxt=[s,s[0]];break;}}
      if(!nxt)break;
      used.add(nxt[0]);loop.push(nxt[1]);
      if(q(loop[loop.length-1])===q(loop[0]))break;
    }
    loops.push(loop);
  }
  // keep the longest loop (outer silhouette)
  loops.sort((a,b)=>b.length-a.length);
  let pts=loops[0];
  // drop duplicated closing point
  if(q(pts[0])===q(pts[pts.length-1]))pts=pts.slice(0,-1);
  // signed area; force CCW
  let area=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a[0]*b[1]-b[0]*a[1];}
  if(area<0)pts=pts.slice().reverse();
  // merge near-collinear
  const clean=[pts[0]];
  for(let i=1;i<pts.length;i++){const p=pts[i],last=clean[clean.length-1];
    if(Math.hypot(p[0]-last[0],p[1]-last[1])>1e-3)clean.push(p);}
  pts=clean;
  const merged=[pts[0]];
  for(let i=1;i<pts.length-1;i++){
    const a=merged[merged.length-1],b=pts[i],c=pts[i+1];
    const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if(Math.abs(cr)>1e-6)merged.push(b);
  }
  {const a=merged[merged.length-1],b=merged[0],c=merged[1];
   const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
   if(Math.abs(cr)<=1e-6)merged.shift();}
  pts=merged;
  // offset polygon with arc joins (outward = left of edge for CCW)
  function offsetPath(d){
    const n=pts.length,path=[];
    for(let i=0;i<n;i++){
      const p=pts[i],pp=pts[(i-1+n)%n],pn=pts[(i+1)%n];
      let e1=[p[0]-pp[0],p[1]-pp[1]],e2=[pn[0]-p[0],pn[1]-p[1]];
      const l1=Math.hypot(...e1),l2=Math.hypot(...e2);e1=[e1[0]/l1,e1[1]/l1];e2=[e2[0]/l2,e2[1]/l2];
      const n1=[-e1[1],e1[0]],n2=[-e2[1],e2[0]];
      const cross=e1[0]*e2[1]-e1[1]*e2[0];
      const A=[p[0]+n1[0]*d,p[1]+n1[1]*d],B=[p[0]+n2[0]*d,p[1]+n2[1]*d];
      if(cross>1e-9){ // convex: arc from A to B centered at p
        const a1=Math.atan2(A[1]-p[1],A[0]-p[0]),a2=Math.atan2(B[1]-p[1],B[0]-p[0]);
        let da=a2-a1;while(da<0)da+=2*Math.PI;
        const steps=Math.max(2,Math.ceil(da/(Math.PI/18)));
        for(let s=0;s<=steps;s++){const a=a1+da*s/steps;path.push([p[0]+d*Math.cos(a),p[1]+d*Math.sin(a)]);}
      }else{ // concave/straight: intersect offset lines
        const denom=e1[0]*(-e2[1])-(-e2[0])*e1[1];
        if(Math.abs(denom)<1e-9){path.push(A);continue;}
        const t=((B[0]-A[0])*(-e2[1])-(B[1]-A[1])*(-e2[0]))/denom;
        path.push([A[0]+e1[0]*t,A[1]+e1[1]*t]);
      }
    }
    return path;
  }
  const pad=offset+ring+1.0;
  const Wpx=Math.ceil((l.W+2*pad)*r*SS),Hpx=Math.ceil((l.H+2*pad)*r*SS);
  const X=v=>(v+pad)*r*SS;
  const draw=(g,path,color)=>{g.fillStyle=color;g.beginPath();
    path.forEach((p,i)=>{i?g.lineTo(X(p[0]),X(p[1])):g.moveTo(X(p[0]),X(p[1]));});
    g.closePath();g.fill();};
  const hi=document.createElement('canvas');hi.width=Wpx;hi.height=Hpx;
  const g=hi.getContext('2d');
  if(ring>0)draw(g,offsetPath(offset+ring),border);
  draw(g,offsetPath(offset),bg);
  for(const c of cells){const s=code.symbols[c.index];
    g.fillStyle=Prism.HEX[s]; /* paint white cells too: skipping them left them transparent, invisible on dark cards */g.beginPath();
    for(let k=0;k<6;k++){const a=(30+60*k)*Math.PI/180,
      x=X(c.x+1.03*Math.cos(a)),y=X(c.y+1.03*Math.sin(a));k?g.lineTo(x,y):g.moveTo(x,y);}
    g.closePath();g.fill();}
  const out=document.createElement('canvas');out.width=Math.ceil(Wpx/SS);out.height=Math.ceil(Hpx/SS);
  const og=out.getContext('2d');og.imageSmoothingQuality='high';
  og.drawImage(hi,0,0,out.width,out.height);
  return out;
}
