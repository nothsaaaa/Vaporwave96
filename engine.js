(() => {
  window.RaytracingEngine = class {
    constructor(c, R=128, D=1e3){
      this.c=c; this.ctx=c.getContext('2d');
      this.R=R; this.D=D; this.F0=100; this.F1=D; this.MAX_REFLECTION_DEPTH=3;
      c.width=c.height=R; this.img=this.ctx.createImageData(R,R); this.px=this.img.data;
      this.scene=[]; this.cam=this.v3(0,0,-500); this.rot={yaw:0,pitch:0};
      const a=Math.PI/4,b=Math.PI*0.75;
      this.sunDir=this.norm({x:Math.cos(a)*Math.sin(b),y:Math.sin(a),z:Math.cos(a)*Math.cos(b)});
      this.MAX_FPS=24; this.FRAME_D=1e3/24; this.lastFrame=0;
      this.loadObjectHandler();
    }
    async loadObjectHandler(){
      if(!window.ObjectHandler){
        let s=document.createElement('script');
        s.src='./sceneManager.js';
        document.head.appendChild(s);
        await new Promise(r=>s.onload=r);
      }
      this.objectHandler=new window.ObjectHandler(this);
    }
    setScene(s){this.scene=s;}
    setCamera(x,y,z){this.cam=this.v3(x,y,z);}
    setRotation(yaw,pitch){this.rot={yaw,pitch};}
    v3=(x,y,z)=>({x,y,z});
    add=(a,b)=>this.v3(a.x+b.x,a.y+b.y,a.z+b.z);
    sub=(a,b)=>this.v3(a.x-b.x,a.y-b.y,a.z-b.z);
    mul=(a,s)=>this.v3(a.x*s,a.y*s,a.z*s);
    dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
    len=a=>Math.sqrt(this.dot(a,a));
    norm=a=>{let l=this.len(a);return l?this.mul(a,1/l):a;}
    cross=(a,b)=>this.v3(a.y*b.z - a.z*b.y,a.z*b.x - a.x*b.z,a.x*b.y - a.y*b.x);
    clamp=(x,m,M)=>x<m?m:x>M?M:x;
    lerp=(a,b,t)=>a+(b - a)*t;
    reflect=(i,n)=>this.sub(i,this.mul(n,2*this.dot(i,n)));
    blendColors=(c1,c2,t)=>({r:this.lerp(c1.r,c2.r,t),g:this.lerp(c1.g,c2.g,t),b:this.lerp(c1.b,c2.b,t)});
    rotateVec(v,r){
      let [cx,sx,cy,sy,cz,sz]=[Math.cos(r.x),Math.sin(r.x),Math.cos(r.y),Math.sin(r.y),Math.cos(r.z),Math.sin(r.z)];
      let x1=v.x,y1=v.y*cx - v.z*sx,z1=v.y*sx + v.z*cx;
      let x2=x1*cy+z1*sy,y2=y1,z2=-x1*sy+z1*cy;
      let x3=x2*cz - y2*sz,y3=x2*sz + y2*cz,z3=z2;
      return this.v3(x3,y3,z3);
    }
    invRotateVec(v,r){
      let [cx,sx,cy,sy,cz,sz]=[Math.cos(-r.x),Math.sin(-r.x),Math.cos(-r.y),Math.sin(-r.y),Math.cos(-r.z),Math.sin(-r.z)];
      let x1=v.x*cz - v.y*sz,y1=v.x*sz + v.y*cz,z1=v.z;
      let x2=x1*cy + z1*sy,y2=y1,z2=-x1*sy + z1*cy;
      let x3=x2,y3=y2*cx - z2*sx,z3=y2*sx + z2*cx;
      return this.v3(x3,y3,z3);
    }
    traceRay(ro,rd,d=0,ignore=null){
      if(d>this.MAX_REFLECTION_DEPTH)return{r:180,g:180,b:180};
      let hit=this.objectHandler.sceneIntersect(ro,rd,ignore);
      if(!hit||hit.t>this.D)return{r:180,g:180,b:180};
      let p=this.add(ro,this.mul(rd,hit.t)),n=this.objectHandler.calculateNormal(hit,p);
      let c=this.objectHandler.applyTexture(hit,p);
      let base=this.shade(p,n,hit.t,this.sunDir,{...hit.obj,color:c});
      let refl=this.objectHandler.getMaterialReflectivity(hit.obj.material);
      if(refl>0){
        let rdir=this.reflect(rd,n),rorig=this.add(p,this.mul(n,1e-4));
        let rcol=this.traceRay(rorig,rdir,d+1,hit.obj);
        return this.blendColors(base,rcol,refl);
      }
      return base;
    }
    shade(p,n,d,l,obj){
      let NdotL=Math.max(0,this.dot(n,l));
      let bc=obj.color||{r:255,g:255,b:255};
      let lit={r:bc.r*(0.2+0.8*NdotL),g:bc.g*(0.2+0.8*NdotL),b:bc.b*(0.2+0.8*NdotL)};
      let shadow=this.objectHandler.inShadow(p,l)?0.3:1;
      lit.r*=shadow; lit.g*=shadow; lit.b*=shadow;
      let fog=this.clamp((d-this.F0)/(this.F1-this.F0),0,1);
      let fc={r:180,g:180,b:180};
      return {r:this.lerp(lit.r,fc.r,fog),g:this.lerp(lit.g,fc.g,fog),b:this.lerp(lit.b,fc.b,fog)};
    }
    getFwd(){return this.norm({x:Math.cos(this.rot.pitch)*Math.sin(this.rot.yaw),y:Math.sin(this.rot.pitch),z:Math.cos(this.rot.pitch)*Math.cos(this.rot.yaw)});}
    getRight(){return this.norm(this.cross(this.getFwd(),this.v3(0,1,0)));}
    getUp(){return this.norm(this.cross(this.getRight(),this.getFwd()));}
    getRay(x,y){
      let px=((x+0.5)/this.R)*2-1,py=1-((y+0.5)/this.R)*2,sc=Math.tan(Math.PI/6),f=this.getFwd(),r=this.getRight(),u=this.getUp();
      return this.norm(this.add(this.add(this.mul(f,1),this.mul(r,px*sc)),this.mul(u,py*sc)));
    }
    render(now=performance.now()){
      if(this.MAX_FPS>0){
        let fd=1e3/this.MAX_FPS;
        if(!this.lastFrame)this.lastFrame=now;
        let e=now-this.lastFrame;
        if(e<fd)return requestAnimationFrame(t=>this.render(t));
        this.lastFrame=now;
      }
      for(let y=0;y<this.R;y++)for(let x=0;x<this.R;x++){
        let i=(y*this.R+x)*4,rd=this.getRay(x,y),c=this.traceRay(this.cam,rd);
        this.px[i]=this.clamp(c.r,0,255);
        this.px[i+1]=this.clamp(c.g,0,255);
        this.px[i+2]=this.clamp(c.b,0,255);
        this.px[i+3]=255;
      }
      this.ctx.putImageData(this.img,0,0);
      requestAnimationFrame(t=>this.render(t));
    }
    start(){this.render();}
  }
})();
