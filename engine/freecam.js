export function setupFreecam(engine, canvas) {
    const keys = {};
    let mouseDown = false;
    const speed = 400;
    const sensitivity = 0.002;

    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    canvas.addEventListener('mousedown', () => {
        mouseDown = true;
        canvas.requestPointerLock();
    });

    document.addEventListener('mouseup', () => {
        mouseDown = false;
        document.exitPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== canvas) mouseDown = false;
    });

    document.addEventListener('mousemove', e => {
        if (!mouseDown) return;
        const rot = engine.rot;
        rot.yaw -= e.movementX * sensitivity;
        rot.pitch -= e.movementY * sensitivity;
        rot.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, rot.pitch));
        engine.setRotation(rot.yaw, rot.pitch);
    });

    function updatePlayer(dt) {
        const cam = engine.cam;
        const rot = engine.rot;

        const forward = {
            x: Math.cos(rot.pitch) * Math.sin(rot.yaw),
            y: Math.sin(rot.pitch),
            z: Math.cos(rot.pitch) * Math.cos(rot.yaw)
        };

        const up = { x: 0, y: 1, z: 0 };
        const right = {
            x: forward.y * up.z - forward.z * up.y,
            y: forward.z * up.x - forward.x * up.z,
            z: forward.x * up.y - forward.y * up.x
        };

        const len = Math.hypot(right.x, right.y, right.z);
        if (len > 0) {
            right.x /= len;
            right.y /= len;
            right.z /= len;
        }

        if (keys['w']) {
            cam.x += forward.x * speed * dt;
            cam.y += forward.y * speed * dt;
            cam.z += forward.z * speed * dt;
        }
        if (keys['s']) {
            cam.x -= forward.x * speed * dt;
            cam.y -= forward.y * speed * dt;
            cam.z -= forward.z * speed * dt;
        }
        if (keys['a']) {
            cam.x -= right.x * speed * dt;
            cam.y -= right.y * speed * dt;
            cam.z -= right.z * speed * dt;
        }
        if (keys['d']) {
            cam.x += right.x * speed * dt;
            cam.y += right.y * speed * dt;
            cam.z += right.z * speed * dt;
        }
        if (keys[' ']) cam.y += speed * dt;
        if (keys['shift']) cam.y -= speed * dt;

        engine.setCamera(cam.x, cam.y, cam.z);
    }

    return updatePlayer;
}
