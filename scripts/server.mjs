/** Local static server with byte-range support for reliable audio/video seeking. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8'};

export function createStaticServer(root, { apiHandler } = {}){
  root=resolve(root);
  return createServer(async(req,res)=>{
    try {
      const requestPath = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(requestPath.startsWith('/api/')){
        if(apiHandler) await apiHandler(req,res);
        else { res.writeHead(404); res.end('Not found'); }
        return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
      let path=requestPath;
      if(path.split('/').some(segment=>segment.startsWith('.')) || !/^\/(?:$|index\.html$|site\.(?:js|css)$|(?:demo|brand|assets|video)\/)/.test(path)){
        res.writeHead(404);res.end('Not found');return;
      }
      if(path.endsWith('/'))path+='index.html';
      const file=resolve(root,`.${path}`);
      if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const info=await stat(file);
      if(!info.isFile()){res.writeHead(404);res.end('Not found');return;}
      const headers={'Content-Type':mime[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
        if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
        else{start=Math.max(0,info.size-Number(match[2]));}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length']=Math.max(0,end-start+1);
      res.writeHead(status,headers);
      if(req.method==='HEAD'||info.size===0){res.end();return;}
      const stream=createReadStream(file,{start,end});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch {if(!res.headersSent){res.writeHead(404);res.end('Not found');}else res.end();}
  });
}
