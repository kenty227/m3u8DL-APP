const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const n=256,pixels=Buffer.alloc((n*4+1)*n);
const segments=[[128,65,128,156],[94,128,128,162],[128,162,162,128],[75,187,181,187]];
function distance(x,y,a,b,c,d){const dx=c-a,dy=d-b,t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a-t*dx,y-b-t*dy);}
for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const off=y*(n*4+1)+1+x*4;
  const dx=Math.max(38-x,x-217,0),dy=Math.max(38-y,y-217,0);
  const inside=Math.hypot(dx,dy)<38;
  const white=segments.some(s=>distance(x,y,...s)<8);
  pixels[off]=white?255:108;pixels[off+1]=white?255:92;pixels[off+2]=white?255:231;pixels[off+3]=inside?255:0;
}
function crc(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(data.length);check.writeUInt32BE(crc(body));return Buffer.concat([length,body,check]);}
const header=Buffer.alloc(13);header.writeUInt32BE(n,0);header.writeUInt32BE(n,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(path.resolve(__dirname,'../src/renderer/icon.png'),png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[8]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
fs.writeFileSync(path.resolve(__dirname,'../src/renderer/icon.ico'),Buffer.concat([ico,png]));

function pngImage(size, paint) {
  const data=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const rgba=paint(x,y),offset=y*(size*4+1)+1+x*4;
    rgba.forEach((value,index)=>{data[offset+index]=value;});
  }
  const info=Buffer.alloc(13);info.writeUInt32BE(size,0);info.writeUInt32BE(size,4);info[8]=8;info[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',info),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
const mac=pngImage(1024,(x,y)=>{
  x/=4;y/=4;
  const dx=Math.max(38-x,x-217,0),dy=Math.max(38-y,y-217,0);
  const white=segments.some(s=>distance(x,y,...s)<8);
  return [white?255:108,white?255:92,white?255:231,Math.hypot(dx,dy)<38?255:0];
});
fs.writeFileSync(path.resolve(__dirname,'../src/renderer/icon-mac.png'),mac);
for(const size of [16,32]) {
  const template=pngImage(size,(x,y)=>{
    const ink=segments.some(s=>distance((x+.5)*256/size,(y+.5)*256/size,...s)<12);
    return [0,0,0,ink?255:0];
  });
  fs.writeFileSync(path.resolve(__dirname,`../src/renderer/trayTemplate${size===32?'@2x':''}.png`),template);
}
