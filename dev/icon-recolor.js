/* IconRecolor: JS port of the approved v4 (shademap4) engine.
   Base art -> two picked colors. Identity at base colors is exact by construction. */
const IconRecolor=(()=>{
const W=1024,H=1024,N=W*H;
let Lo,Ao,Bo,Co,Ho,Ff,refPl,refAl,ready=false;
const srgb2lin=x=>x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);
const lin2srgb=x=>x<=0.0031308?x*12.92:1.055*Math.pow(Math.max(x,0),1/2.4)-0.055;
function rgb2oklabArr(r,g,b){ // scalars in 0..1
  r=srgb2lin(r);g=srgb2lin(g);b=srgb2lin(b);
  let l=0.4122214708*r+0.5363325363*g+0.0514459929*b;
  let m=0.2119034982*r+0.6806995451*g+0.1073969566*b;
  let s=0.0883024619*r+0.2817188376*g+0.6299787005*b;
  l=Math.cbrt(l);m=Math.cbrt(m);s=Math.cbrt(s);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
          1.9779984951*l-2.4285922050*m+0.4505937099*s,
          0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
function hex2rgb(hx){hx=hx.replace('#','');return [0,2,4].map(i=>parseInt(hx.slice(i,i+2),16)/255);}
const circ_d=(h1,h2)=>{let d=h1-h2;return d-2*Math.PI*Math.round(d/(2*Math.PI));};
function gaussianBlur(src,w,h,sigma){
  const rad=Math.max(1,Math.round(sigma*3)),k=new Float32Array(2*rad+1);let sum=0;
  for(let i=-rad;i<=rad;i++){const v=Math.exp(-(i*i)/(2*sigma*sigma));k[i+rad]=v;sum+=v;}
  for(let i=0;i<k.length;i++)k[i]/=sum;
  const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
  for(let y=0;y<h;y++){const row=y*w;
    for(let x=0;x<w;x++){let acc=0;
      for(let i=-rad;i<=rad;i++){let xx=x+i;if(xx<0)xx=0;if(xx>=w)xx=w-1;acc+=src[row+xx]*k[i+rad];}
      tmp[row+x]=acc;}}
  for(let x=0;x<w;x++){
    for(let y=0;y<h;y++){let acc=0;
      for(let i=-rad;i<=rad;i++){let yy=y+i;if(yy<0)yy=0;if(yy>=h)yy=h-1;acc+=tmp[yy*w+x]*k[i+rad];}
      out[y*w+x]=acc;}}
  return out;
}
async function init(url){
  if(ready)return;
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,W,H);
  const d=cx.getImageData(0,0,W,H).data;
  Lo=new Float32Array(N);Ao=new Float32Array(N);Bo=new Float32Array(N);
  Co=new Float32Array(N);Ho=new Float32Array(N);
  const R=new Float32Array(N),G=new Float32Array(N),B=new Float32Array(N);
  for(let i=0,j=0;i<N;i++,j+=4){
    const lab=rgb2oklabArr(d[j]/255,d[j+1]/255,d[j+2]/255);
    Lo[i]=lab[0];Ao[i]=lab[1];Bo[i]=lab[2];
    Co[i]=Math.hypot(lab[1],lab[2]);Ho[i]=Math.atan2(lab[2],lab[1]);
    R[i]=d[j]/255;G[i]=d[j+1]/255;B[i]=d[j+2]/255;
  }
  // --- reference colors: medoids of the two families (mirrors shademap4) ---
  const medoid=mask=>{
    let n=0;const vals=[[],[],[]];
    for(let i=0;i<N;i++)if(mask(i)){vals[0].push(R[i]);vals[1].push(G[i]);vals[2].push(B[i]);n++;}
    return vals.map(v=>{v.sort();return v[v.length>>1];});
  };
  let cnt=0;
  let skyMask=i=>{const x=(i%W)/W,y=(i/W)/H,mx=Math.max(R[i],G[i],B[i]);return mx<0.55&&y<0.30&&x<0.45;};
  for(let i=0;i<N;i++)if(skyMask(i))cnt++;
  if(cnt<5000)skyMask=i=>{const y=(i/W)/H,mx=Math.max(R[i],G[i],B[i]);return mx<0.55&&y<0.45;};
  const refP=medoid(skyMask);
  cnt=0;
  let heartMask=i=>{const x=(i%W)/W,y=(i/W)/H,mx=Math.max(R[i],G[i],B[i]),mn=Math.min(R[i],G[i],B[i]),s=(mx-mn)/(mx+1e-6);
    return s>0.55&&mx>0.6&&x>0.33&&x<0.62&&y>0.36&&y<0.56;};
  for(let i=0;i<N;i++)if(heartMask(i))cnt++;
  if(cnt<2000)heartMask=i=>{const x=(i%W)/W,y=(i/W)/H,mx=Math.max(R[i],G[i],B[i]),mn=Math.min(R[i],G[i],B[i]),s=(mx-mn)/(mx+1e-6);
    return s>0.5&&mx>0.6&&x>0.3&&x<0.65&&y>0.33&&y<0.60;};
  const refA=medoid(heartMask);
  refPl=rgb2oklabArr(...refP);refAl=rgb2oklabArr(...refA);
  // --- continuous family field (no masks in color path) ---
  Ff=new Float32Array(N);
  const soft=0.18;
  for(let i=0;i<N;i++){
    const dA=Math.sqrt((Ao[i]-refAl[1])**2+(Bo[i]-refAl[2])**2+(0.6*(Lo[i]-refAl[0]))**2);
    const dP=Math.sqrt((Ao[i]-refPl[1])**2+(Bo[i]-refPl[2])**2+(0.6*(Lo[i]-refPl[0]))**2);
    let f=0.5+(dP-dA)/(2*soft);f=Math.min(1,Math.max(0,f));
    const lc=Math.min(1,Math.max(0,Co[i]/0.05));
    Ff[i]=f*lc+0.5*(1-lc);
  }
  Ff=gaussianBlur(Ff,W,H,5); // PIL GaussianBlur(10) ~ sigma 5
  ready=true;
}
function refHexes(){
  const to255=v=>Math.round(Math.min(1,Math.max(0,v))*255);
  // refs stored as OKLab; keep original medoid rgb instead:
  return null;
}
function render(hexP,hexA){
  const pP=rgb2oklabArr(...hex2rgb(hexP)),pA=rgb2oklabArr(...hex2rgb(hexA));
  const Hp2=Math.atan2(pP[2],pP[1]),Ha2=Math.atan2(pA[2],pA[1]);
  const Hp1=Math.atan2(refPl[2],refPl[1]),Ha1=Math.atan2(refAl[2],refAl[1]);
  const Cp1=Math.hypot(refPl[1],refPl[2]),Ca1=Math.hypot(refAl[1],refAl[2]);
  const Cp2=Math.hypot(pP[1],pP[2]),Ca2=Math.hypot(pA[1],pA[2]);
  const dHp=circ_d(Hp2,Hp1),dHa=circ_d(Ha2,Ha1);
  const sP=Math.min(1.8,Math.max(0.55,Cp2/(Cp1+1e-6)));
  const sA=Math.min(1.8,Math.max(0.55,Ca2/(Ca1+1e-6)));
  const distf=Math.min(1,(Math.abs(dHp)+Math.abs(dHa))/Math.PI*2),k=distf;
  const out=new Uint8ClampedArray(N*4);
  for(let i=0;i<N;i++){
    const F=Ff[i];
    const dH=F*dHa+(1-F)*dHp;
    const Cs=F*sA+(1-F)*sP;
    const Htmp=Ho[i]+dH;
    const Htarg=Hp2+circ_d(Ha2,Hp2)*F;
    const dip=1-k*0.45*(4*F*(1-F));
    const Hn=Htmp-k*circ_d(Htmp,Htarg);
    let Cn=Co[i]*Cs*dip;
    const L=Lo[i];
    const toRgb=c=>{const a=c*Math.cos(Hn),b=c*Math.sin(Hn);
      let l=L+0.3963377774*a+0.2158037573*b,m=L-0.1055613458*a-0.0638541728*b,s=L-0.0894841775*a-1.2914855480*b;
      l=l*l*l;m=m*m*m;s=s*s*s;
      return [lin2srgb(+4.0767416621*l-3.3077115913*m+0.2309699292*s),
              lin2srgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
              lin2srgb(-0.0041960863*l-0.7034186147*m+1.7076147010*s)];};
    let rgb=toRgb(Cn);
    if(rgb.some(v=>v<0||v>1)){ // gamut: bisect chroma
      let lo=0,hi=Cn;
      for(let it=0;it<14;it++){const mid=0.5*(lo+hi);const rm=toRgb(mid);
        if(rm.some(v=>v<0||v>1))hi=mid;else lo=mid;}
      Cn=hi;rgb=toRgb(Cn);
    }
    const j=i*4;
    out[j]=Math.round(Math.min(1,Math.max(0,rgb[0]))*255);
    out[j+1]=Math.round(Math.min(1,Math.max(0,rgb[1]))*255);
    out[j+2]=Math.round(Math.min(1,Math.max(0,rgb[2]))*255);
    out[j+3]=255;
  }
  return new ImageData(out,W,H);
}
async function recolor(hexP,hexA,masterUrl){
  await init(masterUrl);
  const id=render(hexP,hexA);
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;
  cv.getContext('2d').putImageData(id,0,0);
  return cv;
}
return {recolor,render,init,W,H};
})();
