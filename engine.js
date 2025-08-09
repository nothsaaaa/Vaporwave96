(() => {
  window.RaytracingEngine = class RaytracingEngine {
    constructor(canvas, resolution = 128, maxDistance = 1000) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.R = resolution;
      this.D = maxDistance;
      this.F0 = 100;
      this.F1 = maxDistance;
      this.MAX_REFLECTION_DEPTH = 3;
      
      canvas.width = resolution;
      canvas.height = resolution;
      
      this.img = this.ctx.createImageData(this.R, this.R);
      this.px = this.img.data;
      
      this.scene = [];
      this.idGen = (function(){ let i = 1; return () => i++; })();
      this.cam = this.v3(0, 0, -500);
      this.rot = { yaw: 0, pitch: 0 };
      
      this.sunDir = this.norm({
        x: Math.cos(Math.PI/4) * Math.sin(Math.PI * 0.75),
        y: Math.sin(Math.PI/4),
        z: Math.cos(Math.PI/4) * Math.cos(Math.PI * 0.75)
      });
      
      this.MAX_FPS = 24;
      this.FRAME_D = 1000 / this.MAX_FPS;
      this.lastFrame = 0;
    }

    setCamera(x, y, z) {
      this.cam = this.v3(x, y, z);
    }
    
    setRotation(yaw, pitch) {
      this.rot = { yaw, pitch };
    }
    
    getCamera() {
      return { x: this.cam.x, y: this.cam.y, z: this.cam.z };
    }
    
    getRotation() {
      return { yaw: this.rot.yaw, pitch: this.rot.pitch };
    }

    v3(x, y, z) { return { x, y, z }; }
    add(a, b) { return this.v3(a.x + b.x, a.y + b.y, a.z + b.z); }
    sub(a, b) { return this.v3(a.x - b.x, a.y - b.y, a.z - b.z); }
    mul(a, s) { return this.v3(a.x * s, a.y * s, a.z * s); }
    dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    len(a) { return Math.sqrt(this.dot(a, a)); }
    norm(a) { let l = this.len(a); return l ? this.mul(a, 1/l) : a; }
    cross(a, b) { return this.v3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x); }
    clamp(x, m, M) { return x < m ? m : x > M ? M : x; }
    lerp(a, b, t) { return a + (b - a) * t; }

    reflect(incident, normal) {
      return this.sub(incident, this.mul(normal, 2 * this.dot(incident, normal)));
    }

    blendColors(color1, color2, t) {
      return {
        r: this.lerp(color1.r, color2.r, t),
        g: this.lerp(color1.g, color2.g, t),
        b: this.lerp(color1.b, color2.b, t)
      };
    }

    rotateVec(v, r) {
      let cx = Math.cos(r.x), sx = Math.sin(r.x),
          cy = Math.cos(r.y), sy = Math.sin(r.y),
          cz = Math.cos(r.z), sz = Math.sin(r.z);
      let x1 = v.x, y1 = v.y * cx - v.z * sx, z1 = v.y * sx + v.z * cx;
      let x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
      let x3 = x2 * cz - y2 * sz, y3 = x2 * sz + y2 * cz, z3 = z2;
      return this.v3(x3, y3, z3);
    }

    invRotateVec(v, r) {
      let cx = Math.cos(-r.x), sx = Math.sin(-r.x),
          cy = Math.cos(-r.y), sy = Math.sin(-r.y),
          cz = Math.cos(-r.z), sz = Math.sin(-r.z);
      let x1 = v.x * cz - v.y * sz, y1 = v.x * sz + v.y * cz, z1 = v.z;
      let x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
      let x3 = x2, y3 = y2 * cx - z2 * sx, z3 = y2 * sx + z2 * cx;
      return this.v3(x3, y3, z3);
    }

    createObject(x, y, z, size, type, rotation = {x:0, y:0, z:0}, color = {r:255, g:255, b:255}, reflectivity = 0.0) {
      const id = this.idGen();
      this.scene.push({
        id,
        pos: this.v3(x, y, z),
        s: size,
        type,
        rot: rotation,
        color: color,
        reflectivity: this.clamp(reflectivity, 0.0, 1.0)
      });
      return id;
    }

    updateObject(id, properties) {
      const obj = this.scene.find(o => o.id === id);
      if (!obj) return;
      
      if (properties.rotation) obj.rot = Object.assign(obj.rot || {}, properties.rotation);
      if (properties.position) obj.pos = properties.position;
      if (properties.color) obj.color = properties.color;
      if (properties.reflectivity !== undefined) obj.reflectivity = this.clamp(properties.reflectivity, 0.0, 1.0);
    }

    intersectSphere(o, ro, rd) {
      let oc = this.sub(ro, o.pos);
      let a = this.dot(rd, rd);
      let b = 2 * this.dot(oc, rd);
      let c = this.dot(oc, oc) - o.s * o.s;
      let d = b * b - 4 * a * c;
      if (d < 0) return null;
      d = Math.sqrt(d);
      let t1 = (-b - d) / (2 * a);
      let t2 = (-b + d) / (2 * a);
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 < 0) t1 = t2;
      if (t1 < 0) return null;
      return t1;
    }

    intersectCube(o, ro, rd) {
      let roLocal = this.sub(ro, o.pos);
      roLocal = this.invRotateVec(roLocal, o.rot);
      let rdLocal = this.invRotateVec(rd, o.rot);

      let tMin = -Infinity, tMax = Infinity;
      for (let i = 0; i < 3; i++) {
        let roC = roLocal[['x', 'y', 'z'][i]];
        let rdC = rdLocal[['x', 'y', 'z'][i]];
        let minB = -o.s, maxB = o.s;
        if (Math.abs(rdC) < 1e-6) {
          if (roC < minB || roC > maxB) return null;
        } else {
          let t1 = (minB - roC) / rdC;
          let t2 = (maxB - roC) / rdC;
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tMin) tMin = t1;
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) return null;
          if (tMax < 0) return null;
        }
      }
      return tMin > 0 ? tMin : tMax > 0 ? tMax : null;
    }

    intersectPlane(o, ro, rd) {
      if (Math.abs(rd.y) < 1e-6) return null;
      let t = (o.pos.y - ro.y) / rd.y;
      return t > 0 ? t : null;
    }

    intersect(o, ro, rd) {
      if (o.type === 'sphere') return this.intersectSphere(o, ro, rd);
      if (o.type === 'plane') return this.intersectPlane(o, ro, rd);
      if (o.type === 'cube') return this.intersectCube(o, ro, rd);
      return null;
    }

    sceneIntersect(ro, rd, ignoreObj = null) {
      let tmin = Infinity, hit = null;
      for (let o of this.scene) {
        if (o === ignoreObj) continue;
        let t = this.intersect(o, ro, rd);
        if (t !== null && t < tmin) {
          tmin = t;
          hit = o;
        }
      }
      return hit ? { t: tmin, obj: hit } : null;
    }

    getObjectTexture(p, obj) {
      let u, v;
      const tileSize = 2.0;
      
      if (obj.type === 'sphere') {
        let localP = this.norm(this.sub(p, obj.pos));
        let phi = Math.atan2(localP.z, localP.x);
        let theta = Math.acos(this.clamp(localP.y, -1, 1));
        u = (phi + Math.PI) / (2 * Math.PI) * 10;
        v = theta / Math.PI * 10;
      } else if (obj.type === 'cube') {
        let localP = this.invRotateVec(this.sub(p, obj.pos), obj.rot);
        
        let absX = Math.abs(localP.x);
        let absY = Math.abs(localP.y); 
        let absZ = Math.abs(localP.z);
        let maxAxis = Math.max(absX, absY, absZ);
        
        if (maxAxis === absX) {
          u = (localP.z + obj.s) / (2 * obj.s) * 4;
          v = (localP.y + obj.s) / (2 * obj.s) * 4;
        } else if (maxAxis === absY) {
          u = (localP.x + obj.s) / (2 * obj.s) * 4;
          v = (localP.z + obj.s) / (2 * obj.s) * 4;
        } else {
          u = (localP.x + obj.s) / (2 * obj.s) * 4;
          v = (localP.y + obj.s) / (2 * obj.s) * 4;
        }
      } else if (obj.type === 'plane') {
        u = (p.x - obj.pos.x) / 50;
        v = (p.z - obj.pos.z) / 50;
      }
      
      const tileU = Math.floor(u);
      const tileV = Math.floor(v);
      const checker = (tileU + tileV) % 2;
      const intensity = checker === 0 ? 1.0 : 0.7;
      
      return {
        r: obj.color.r * intensity,
        g: obj.color.g * intensity,
        b: obj.color.b * intensity
      };
    }

    inShadow(p, ld) {
      const epsilon = 1e-2;
      const origin = this.add(p, this.mul(ld, epsilon));
      for (let obj of this.scene) {
        let t = this.intersect(obj, origin, ld);
        if (t !== null && t < 1e4) return true;
      }
      return false;
    }

    traceRay(ro, rd, depth = 0, ignoreObj = null) {
      if (depth > this.MAX_REFLECTION_DEPTH) {
        return { r: 180, g: 180, b: 180 };
      }

      let hit = this.sceneIntersect(ro, rd, ignoreObj);
      
      if (!hit || hit.t > this.D) {
        return { r: 180, g: 180, b: 180 };
      }

      let p = this.add(ro, this.mul(rd, hit.t));
      let n;
      
      if (hit.obj.type === 'sphere') {
        n = this.norm(this.sub(p, hit.obj.pos));
      } else if (hit.obj.type === 'plane') {
        n = this.v3(0, 1, 0);
      } else if (hit.obj.type === 'cube') {
        let localP = this.invRotateVec(this.sub(p, hit.obj.pos), hit.obj.rot);
        let absX = Math.abs(localP.x), absY = Math.abs(localP.y), absZ = Math.abs(localP.z);
        let maxC = Math.max(absX, absY, absZ);
        let nLocal = this.v3(0, 0, 0);
        if (maxC === absX) nLocal.x = localP.x > 0 ? 1 : -1;
        else if (maxC === absY) nLocal.y = localP.y > 0 ? 1 : -1;
        else nLocal.z = localP.z > 0 ? 1 : -1;
        n = this.norm(this.rotateVec(nLocal, hit.obj.rot));
      }

      let baseColor = this.shade(p, n, hit.t, this.sunDir, hit.obj);

      if (hit.obj.reflectivity > 0) {
        const epsilon = 1e-4;
        let reflectionDir = this.reflect(rd, n);
        let reflectionOrigin = this.add(p, this.mul(n, epsilon));
        
        let reflectionColor = this.traceRay(reflectionOrigin, reflectionDir, depth + 1, hit.obj);
        
        return this.blendColors(baseColor, reflectionColor, hit.obj.reflectivity);
      }

      return baseColor;
    }

    shade(p, n, distance, lightDir, obj) {
      let NdotL = Math.max(0, this.dot(n, lightDir));
      
      let baseColor = this.getObjectTexture(p, obj);
      
      let litColor = {
        r: baseColor.r * (0.2 + 0.8 * NdotL),
        g: baseColor.g * (0.2 + 0.8 * NdotL),
        b: baseColor.b * (0.2 + 0.8 * NdotL)
      };
      
      let shadowFactor = this.inShadow(p, lightDir) ? 0.3 : 1.0;
      litColor.r *= shadowFactor;
      litColor.g *= shadowFactor;
      litColor.b *= shadowFactor;
      
      let fogAmount = this.clamp((distance - this.F0) / (this.F1 - this.F0), 0, 1);
      let fogColor = { r: 180, g: 180, b: 180 };
      
      return {
        r: this.lerp(litColor.r, fogColor.r, fogAmount),
        g: this.lerp(litColor.g, fogColor.g, fogAmount),
        b: this.lerp(litColor.b, fogColor.b, fogAmount)
      };
    }

    getFwd() {
      return this.norm({
        x: Math.cos(this.rot.pitch) * Math.sin(this.rot.yaw),
        y: Math.sin(this.rot.pitch),
        z: Math.cos(this.rot.pitch) * Math.cos(this.rot.yaw)
      });
    }

    getRight() {
      return this.norm(this.cross(this.getFwd(), this.v3(0, 1, 0)));
    }

    getUp() {
      return this.norm(this.cross(this.getRight(), this.getFwd()));
    }

    getRay(x, y) {
      const px = ((x + 0.5) / this.R) * 2 - 1;
      const py = 1 - ((y + 0.5) / this.R) * 2;
      const scale = Math.tan(Math.PI / 6);
      
      const f = this.getFwd();
      const r = this.getRight();
      const u = this.getUp();
      
      return this.norm(
        this.add(
          this.add(this.mul(f, 1), this.mul(r, px * scale)),
          this.mul(u, py * scale)
        )
      );
    }

    render(now = performance.now()) {
      if (!this.lastFrame) this.lastFrame = now;
      const elapsed = now - this.lastFrame;
      
      if (elapsed < this.FRAME_D) {
        requestAnimationFrame(() => this.render());
        return;
      }
      
      this.lastFrame = now;
      
      let hits = 0;
      for (let y = 0; y < this.R; y++) {
        for (let x = 0; x < this.R; x++) {
          let i = (y * this.R + x) * 4;
          let rd = this.getRay(x, y);
          let ro = this.cam;
          
          let color = this.traceRay(ro, rd);
          
          this.px[i] = this.clamp(color.r, 0, 255);
          this.px[i + 1] = this.clamp(color.g, 0, 255);
          this.px[i + 2] = this.clamp(color.b, 0, 255);
          this.px[i + 3] = 255;
          
          hits++;
        }
      }
      
      this.ctx.putImageData(this.img, 0, 0);
      setTimeout(() => requestAnimationFrame(() => this.render()), Math.min(hits / 1000, 18));
    }

    getAllObjects() {
      return this.scene;
    }

    getObject(id) {
      return this.scene.find(o => o.id === id) || null;
    }

    start() {
      this.render();
    }
  };
})();