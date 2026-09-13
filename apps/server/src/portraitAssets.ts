import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';

/** Immutable originals live outside catalog JSON and websocket messages. */
export function portraitAssets() {
 const router=express.Router();const directory=resolve(dirname(process.env.CATALOG_FILE??'data/catalog.json'),'portraits');
 router.post('/',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'8mb'}),(req,res)=>{
  if(!Buffer.isBuffer(req.body)){res.status(400).json({error:'invalidImage'});return;}
  const bytes=req.body;const mime=req.get('Content-Type')?.split(';')[0];
  const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false;
  if(!valid){res.status(400).json({error:'invalidImage'});return;}
  const ext=mime!.split('/')[1];const name=`${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  mkdirSync(directory,{recursive:true});const target=resolve(directory,name);if(!existsSync(target))writeFileSync(target,bytes,{flag:'wx'});
  res.json({path:`/api/portraits/${name}`});
 });
 router.use(express.static(directory,{immutable:true,maxAge:'1y',fallthrough:false}));return router;
}
