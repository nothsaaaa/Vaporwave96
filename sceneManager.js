(() => {
  window.ObjectHandler = class ObjectHandler {
    constructor(engine) {
      this.engine = engine;
    }

    intersectSphere(o, ro, rd) {
      let oc = this.engine.sub(ro, o.pos);
      let a = this.engine.dot(rd, rd);
      let b = 2 * this.engine.dot(oc, rd);
      let c = this.engine.dot(oc, oc) - o.s * o.s;
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
      let roLocal = this.engine.invRotateVec(this.engine.sub(ro, o.pos), o.rot);
      let rdLocal = this.engine.invRotateVec(rd, o.rot);
      let tMin = -Infinity, tMax = Infinity;
      for (let i = 0; i < 3; i++) {
        let roC = roLocal[['x','y','z'][i]];
        let rdC = rdLocal[['x','y','z'][i]];
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
      for (let o of this.engine.scene) {
        if (o === ignoreObj) continue;
        let t = this.intersect(o, ro, rd);
        if (t !== null && t < tmin) { tmin = t; hit = o; }
      }
      return hit ? { t: tmin, obj: hit } : null;
    }

    calculateNormal(hit, p) {
      let n;
      if (hit.obj.type === 'sphere') {
        n = this.engine.norm(this.engine.sub(p, hit.obj.pos));
      }
      else if (hit.obj.type === 'plane') {
        n = this.engine.v3(0, 1, 0);
      }
      else if (hit.obj.type === 'cube') {
        let localP = this.engine.invRotateVec(this.engine.sub(p, hit.obj.pos), hit.obj.rot);
        let absX = Math.abs(localP.x), absY = Math.abs(localP.y), absZ = Math.abs(localP.z);
        let maxC = Math.max(absX, absY, absZ);
        let nLocal = this.engine.v3(0, 0, 0);
        if (maxC === absX) nLocal.x = localP.x > 0 ? 1 : -1;
        else if (maxC === absY) nLocal.y = localP.y > 0 ? 1 : -1;
        else nLocal.z = localP.z > 0 ? 1 : -1;
        n = this.engine.norm(this.engine.rotateVec(nLocal, hit.obj.rot));
      }
      return n;
    }

    applyTexture(hit, p) {
      let objectColor = { ...hit.obj.color };
      
      if (hit.obj.texture === "grid") {
        const scale = hit.obj.texScale || 20;
        let u, v;
        
        if (hit.obj.type === "sphere") {
          let localP = this.engine.norm(this.engine.sub(p, hit.obj.pos));
          let theta = Math.acos(localP.y);
          let phi = Math.atan2(localP.z, localP.x);
          u = phi / (2 * Math.PI);
          v = theta / Math.PI;
          u *= scale;
          v *= scale;
        }
        else if (hit.obj.type === "plane") {
          u = p.x / scale;
          v = p.z / scale;
        }
        else if (hit.obj.type === "cube") {
          let localP = this.engine.invRotateVec(this.engine.sub(p, hit.obj.pos), hit.obj.rot);
          let absX = Math.abs(localP.x), absY = Math.abs(localP.y), absZ = Math.abs(localP.z);
          let maxC = Math.max(absX, absY, absZ);

          if (maxC === absX) {
            u = localP.z / scale;
            v = localP.y / scale;
          }
          else if (maxC === absY) {
            u = localP.x / scale;
            v = localP.z / scale;
          }
          else {
            u = localP.x / scale;
            v = localP.y / scale;
          }
        }

        const checkU = Math.floor(u);
        const checkV = Math.floor(v);
        const isDark = (checkU + checkV) % 2 === 0;

        if (isDark) {
          objectColor.r *= 0.3;
          objectColor.g *= 0.3;
          objectColor.b *= 0.3;
        }
      }
      
      return objectColor;
    }

    getMaterialReflectivity(material) {
      if (material === "Metal") return 0.4;
      if (material === "Reflective") return 0.8;
      return 0.0;
    }

    inShadow(p, ld) {
      const origin = this.engine.add(p, this.engine.mul(ld, 1e-2));
      for (let obj of this.engine.scene) {
        let t = this.intersect(obj, origin, ld);
        if (t !== null && t < 1e4) return true;
      }
      return false;
    }
  };
})();