const fs=require('node:fs');
const path=require('node:path');
const {deflateRawSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const version=require('../package.json').version;
const selected=['src','scripts','tests','.github','docs','native/Runner.cs','package.json','package-lock.json','README.md','CONTRIBUTING.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md','.gitignore','.gitattributes'];
const files=[];
function collect(relative){
  const file=path.join(root,relative),stat=fs.lstatSync(file);
  if(stat.isSymbolicLink())throw new Error(`Source archive excludes symlinks: ${relative}`);
  if(stat.isDirectory())for(const child of fs.readdirSync(file).sort())collect(`${relative}/${child}`);
  else files.push(relative);
}
selected.forEach(collect);
function crc(data){let value=0xffffffff;for(const byte of data){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
const body=[],central=[];let offset=0;
for(const relative of files){
  const name=Buffer.from(`m3u8-Studio-${version}-Source/${relative}`),data=fs.readFileSync(path.join(root,relative)),compressed=deflateRawSync(data),checksum=crc(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(33,14);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
  body.push(local,name,compressed);central.push(entry,name);offset+=local.length+name.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const output=path.join(root,'dist',`m3u8-Studio-${version}-Source.zip`);
fs.writeFileSync(output,Buffer.concat([...body,directory,end]));
console.log(`Source archive: ${output} (${files.length} files; no local state, downloads or tools)`);
