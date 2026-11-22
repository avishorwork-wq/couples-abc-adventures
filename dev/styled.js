/* Styled renderer: quiet zone follows the code silhouette (L-shape with the
   orientation-gap step), two offset outlines = tinted contour border + white zone. */
function styledPrism(code,r,{offset=2.0,ring=0.45,border='#e2549b',bg='#ffffff'}={}){
  const l=code.layout,pad=offset+ring+1.2;
  const Wpx=Math.ceil((l.W+2*pad)*r),Hpx=Math.ceil((l.H+2*pad)*r);
  const mask=document.createElement('canvas');mask.width=Wpx;mask.height=Hpx;
  const mctx=mask.getContext('2d');mctx.fillStyle='#000';
  const hex=(g,c,rad)=>{g.beginPath();for(let k=0;k<6;k++){const a=(30+60*k)*Math.PI/180,
    x=(c.x+pad+rad*Math.cos(a))*r,y=(c.y+pad+rad*Math.sin(a))*r;k?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();};
  for(const c of l.cells){if(c.role==='gap')continue;hex(mctx,c,1.03);}
  const dilate=(rad)=>{const t=document.createElement('canvas');t.width=Wpx;t.height=Hpx;
    const tc=t.getContext('2d',{willReadFrequently:true});
    tc.filter='blur('+rad+'px)';tc.drawImage(mask,0,0);
    const id=tc.getImageData(0,0,Wpx,Hpx),d=id.data;
    for(let i=3;i<d.length;i+=4)d[i]=d[i]>44?255:0;
    tc.putImageData(id,0,0);return t;};
  const tinted=(sil,color)=>{const t=document.createElement('canvas');t.width=Wpx;t.height=Hpx;
    const tc=t.getContext('2d');tc.drawImage(sil,0,0);
    tc.globalCompositeOperation='source-in';tc.fillStyle=color;tc.fillRect(0,0,Wpx,Hpx);return t;};
  const out=document.createElement('canvas');out.width=Wpx;out.height=Hpx;
  const octx=out.getContext('2d');
  octx.drawImage(tinted(dilate((offset+ring)*r),border),0,0);
  octx.drawImage(tinted(dilate(offset*r),bg),0,0);
  for(const c of l.cells){const s=code.symbols[c.index];if(s===8)continue;
    octx.fillStyle=Prism.HEX[s];hex(octx,c,1.03);}
  return out;
}
