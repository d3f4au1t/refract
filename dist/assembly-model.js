import * as THREE from './vendor/three/three.module.min.js';

// Original, procedural artwork. All components share the same assembly coordinates.
export function createPrototype(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 50);
  const device = new THREE.Group();
  scene.add(device);
  scene.add(new THREE.HemisphereLight(0xe3efff, 0x181e28, 2.5));
  const key = new THREE.DirectionalLight(0xf4f7ff, 4.5);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 7, bottom: -5, near: .1, far: 20 });
  key.shadow.bias = -.0003;
  key.shadow.normalBias = .015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ccfff, 3);
  rim.position.set(4, 3, -5);
  scene.add(rim);

  function texture(width, height, paint) {
    const image = document.createElement('canvas');
    image.width = width; image.height = height;
    paint(image.getContext('2d'), width, height);
    const result = new THREE.CanvasTexture(image);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return result;
  }
  const environment = texture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#252a34'; ctx.fillRect(0, 0, w, h);
    const light = ctx.createLinearGradient(0, 0, 0, h);
    light.addColorStop(0, '#eff5ff'); light.addColorStop(.35, '#b1bdcc');
    light.addColorStop(.6, '#222732'); light.addColorStop(1, '#06080c');
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(125, 80, 130, 250); ctx.fillRect(690, 30, 48, 250);
  });
  environment.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(environment);
  scene.environment = environmentTarget.texture;
  environment.dispose(); pmrem.dispose();

  const material = (color, metalness = 0, roughness = .4) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const aluminum = material(0x67717d, .86, .27);
  const edgeMetal = material(0xb0bac6, .85, .24);
  const dark = material(0x0c1018, .35, .4);
  const solder = material(0xced3d8, .88, .24);
  const gold = material(0xc8a568, .78, .33);
  const boardMaterial = material(0x19363c, .23, .55);

  function roundedPath(width, depth, radius, Path = THREE.Shape, cx = 0, cz = 0) {
    const shape = new Path();
    const x = cx - width / 2, z = cz - depth / 2;
    shape.moveTo(x + radius, z);
    shape.lineTo(x + width - radius, z);
    shape.quadraticCurveTo(x + width, z, x + width, z + radius);
    shape.lineTo(x + width, z + depth - radius);
    shape.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
    shape.lineTo(x + radius, z + depth);
    shape.quadraticCurveTo(x, z + depth, x, z + depth - radius);
    shape.lineTo(x, z + radius);
    shape.quadraticCurveTo(x, z, x + radius, z);
    return shape;
  }
  function plate(parent, width, depth, height, radius, surface, y = 0, holes = []) {
    const shape = roundedPath(width, depth, radius);
    holes.forEach(hole => shape.holes.push(roundedPath(...hole, THREE.Path)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelSize: Math.min(.018, height / 3), bevelThickness: Math.min(.018, height / 3), curveSegments: 12,
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function box(parent, size, position, surface) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function cylinder(parent, radius, height, position, surface) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), surface);
    mesh.position.set(...position); mesh.castShadow = true;
    parent.add(mesh); return mesh;
  }
  function decal(parent, width, depth, y, map, x = 0, z = 0, unlit = false) {
    const surface = unlit
      ? new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map, transparent: true, roughness: .65 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), surface);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z);
    mesh.receiveShadow = !unlit; parent.add(mesh); return mesh;
  }
  const base = new THREE.Group(); device.add(base);
  plate(base, 3.6, 2.6, .09, .23, aluminum);
  plate(base, 3.6, 2.6, .32, .23, aluminum, .08, [[3.32, 2.32, .15]]);
  plate(base, 3.3, 2.3, .014, .14, dark, .1);
  for (const x of [-1.45, 1.45]) for (const z of [-.95, .95]) {
    cylinder(base, .09, .15, [x, .19, z], edgeMetal);
    cylinder(base, .035, .005, [x, .267, z], dark);
  }
  // USB socket in the front wall: its opening and internal tongue are separate meshes.
  box(base, [.5, .17, .035], [0, .225, 1.311], edgeMetal);
  box(base, [.42, .115, .04], [0, .225, 1.335], dark);
  box(base, [.3, .025, .045], [0, .225, 1.36], solder);
  for (const x of [-1.35, 1.35]) for (const z of [-.88, .88]) cylinder(base, .14, .05, [x, -.04, z], dark);

  const pcb = new THREE.Group(); device.add(pcb);
  plate(pcb, 3.15, 2.15, .045, .13, boardMaterial, .255);
  const traces = texture(1536, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#91bda070'; ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      const y = 95 + i * 46;
      ctx.beginPath(); ctx.moveTo(90, y); ctx.lineTo(220 + i * 17, y);
      ctx.lineTo(300 + i * 17, y + 70); ctx.lineTo(1180 - i * 10, y + 70); ctx.stroke();
    }
    ctx.fillStyle = '#d6c38c';
    for (let i = 0; i < 24; i++) { ctx.fillRect(180 + i * 48, 55, 16, 34); ctx.fillRect(180 + i * 48, 935, 16, 34); }
    ctx.strokeStyle = '#b5cacc85'; ctx.lineWidth = 2; ctx.strokeRect(490, 310, 345, 330);
    ctx.font = '22px monospace'; ctx.fillStyle = '#d0e2dc';
    ctx.fillText('REFRACT  /  SENSOR BOARD', 100, 865); ctx.fillText('REV 01', 1120, 865);
    ctx.font = '16px monospace'; ctx.fillText('3V3   GND   SDA   SCL', 950, 150);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath(); ctx.arc(100 + i * 99, 820 - (i % 3) * 145, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#d6c38c'; ctx.stroke();
    }
  });
  decal(pcb, 3.12, 2.12, .317, traces);
  box(pcb, [.72, .11, .68], [-.2, .36, -.02], dark);
  for (let i = 0; i < 9; i++) {
    for (const side of [-1, 1]) {
      box(pcb, [.09, .035, .035], [-.2 + side * .405, .327, -.29 + i * .067], solder);
      box(pcb, [.035, .035, .09], [-.48 + i * .069, .327, side * .385 - .02], solder);
    }
  }
  const chipPrint = texture(256, 256, ctx => {
    ctx.fillStyle = '#8c969e'; ctx.font = '28px monospace'; ctx.fillText('RF-01', 25, 120);
    ctx.font = '17px monospace'; ctx.fillText('MCU', 26, 149); ctx.beginPath(); ctx.arc(27, 25, 8, 0, 7); ctx.fill();
  });
  decal(pcb, .68, .64, .418, chipPrint, -.2, -.02);
  for (let i = 0; i < 9; i++) {
    const x = -1.25 + (i % 3) * .25, z = -.6 + Math.floor(i / 3) * .31;
    box(pcb, [.14, .06, .075], [x, .345, z], dark);
    box(pcb, [.025, .065, .078], [x - .065, .345, z], solder);
    box(pcb, [.025, .065, .078], [x + .065, .345, z], solder);
  }
  for (let i = 0; i < 8; i++) cylinder(pcb, .025, .16, [.65 + i * .09, .38, -.82], gold);
  box(pcb, [.75, .09, .15], [1, .34, -.82], dark);

  const sensor = new THREE.Group(); device.add(sensor);
  const sensorPlate = plate(sensor, .7, .63, .035, .07, boardMaterial, .34);
  sensorPlate.position.set(1.02, .34, .38);
  box(sensor, [.36, .13, .32], [1.02, .435, .38], edgeMetal);
  for (let i = 0; i < 3; i++) box(sensor, [.25, .004, .025], [1.02, .502, .30 + i * .075], dark);
  for (let i = 0; i < 4; i++) cylinder(sensor, .022, .13, [.79 + i * .15, .325, .65], gold);

  const display = new THREE.Group(); device.add(display);
  const displayMount = plate(display, 2.38, 1.56, .06, .09, dark, .45);
  displayMount.position.x = -.3;
  const displayTrim = plate(display, 2.26, 1.45, .025, .065, edgeMetal, .515);
  displayTrim.position.x = -.3;
  const screenBlack = plate(display, 2.14, 1.32, .018, .055, material(0x03080c, .4, .18), .544);
  screenBlack.position.x = -.3;
  box(display, [.48, .02, .57], [.15, .441, .72], gold);
  const displayTexture = texture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#06171e'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#96b6be'; ctx.font = '23px monospace'; ctx.fillText('ROOM TEMPERATURE', 60, 74);
    ctx.font = '22px monospace'; ctx.fillStyle = '#5f8991'; ctx.fillText('DEMO', 865, 74);
    ctx.font = '180px sans-serif'; ctx.fillStyle = '#d4faff'; ctx.fillText('22.4', 52, 295);
    ctx.font = '56px sans-serif'; ctx.fillText('°C', 470, 195);
    ctx.font = '25px monospace'; ctx.fillStyle = '#90b9c4'; ctx.fillText('48%  HUMIDITY', 65, 370);
    ctx.strokeStyle = '#27515a'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(60, 440 + i * 40); ctx.lineTo(960, 440 + i * 40); ctx.stroke(); }
    ctx.strokeStyle = '#9ad9e0'; ctx.lineWidth = 4; ctx.beginPath();
    for (let x = 0; x <= 900; x += 15) {
      const y = 493 + Math.sin(x / 100) * 24 + Math.cos(x / 44) * 8 - x * .025;
      if (x === 0) ctx.moveTo(60, y); else ctx.lineTo(60 + x, y);
    }
    ctx.stroke();
  });
  const screen = decal(display, 2.08, 1.25, .574, displayTexture, -.3, 0, true);
  screen.material.opacity = 0;

  const lid = new THREE.Group(); device.add(lid);
  const lidShape = roundedPath(3.6, 2.6, .23);
  lidShape.holes.push(roundedPath(2.29, 1.49, .08, THREE.Path, -.3, 0));
  for (let i = 0; i < 5; i++) lidShape.holes.push(roundedPath(.055, .8, .025, THREE.Path, 1.03 + i * .11, 0));
  const lidGeometry = new THREE.ExtrudeGeometry(lidShape, { depth: .115, bevelEnabled: true, bevelSegments: 3, bevelSize: .018, bevelThickness: .018, curveSegments: 12 });
  lidGeometry.rotateX(-Math.PI / 2);
  const lidMesh = new THREE.Mesh(lidGeometry, aluminum);
  lidMesh.position.y = .41; lidMesh.castShadow = true; lidMesh.receiveShadow = true; lid.add(lidMesh);
  for (const x of [-1.48, 1.48]) for (const z of [-1.01, 1.01]) {
    cylinder(lid, .055, .012, [x, .548, z], edgeMetal);
    box(lid, [.059, .003, .012], [x, .556, z], dark);
  }
  const brand = texture(1024, 128, ctx => {
    ctx.fillStyle = '#d1dae0'; ctx.font = '32px monospace'; ctx.fillText('R E F R A C T', 0, 72);
    ctx.fillStyle = '#a4b2bf'; ctx.font = '22px monospace'; ctx.fillText('PROTOTYPE 01', 615, 72);
  });
  decal(lid, 2.85, .29, .547, brand, 0, .99);
  const ledMaterial = new THREE.MeshBasicMaterial({ color: 0x19312f, toneMapped: false });
  cylinder(lid, .033, .009, [-1.15, .55, -.99], ledMaterial);

  const guides = new THREE.Group(); device.add(guides);
  const guideMaterial = new THREE.LineDashedMaterial({ color: 0x99bed0, dashSize: .05, gapSize: .07, transparent: true, opacity: .2 });
  for (const x of [-1.48, 1.48]) for (const z of [-1.01, 1.01]) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, .12, z), new THREE.Vector3(x, 3.65, z)]), guideMaterial);
    line.computeLineDistances(); guides.add(line);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .26 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.08; floor.receiveShadow = true; scene.add(floor);
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = (value, start, end) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };
  let lastWidth = 0, lastHeight = 0;

  return {
    render(progress, width, height) {
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setSize(width, height, false); lastWidth = width; lastHeight = height;
      }
      const boardProgress = ease(progress, .06, .36);
      const sensorProgress = ease(progress, .25, .53);
      const displayProgress = ease(progress, .43, .73);
      const lidProgress = ease(progress, .63, .91);
      const power = ease(progress, .92, .99);
      pcb.position.y = (1 - boardProgress) * .76;
      sensor.position.set((1 - sensorProgress) * .58, (1 - sensorProgress) * 1.46, 0);
      display.position.y = (1 - displayProgress) * 2.12;
      lid.position.y = (1 - lidProgress) * 3.04;
      screen.material.opacity = power;
      ledMaterial.color.setRGB(.05 + power * .4, .1 + power * .8, .12 + power * .72);
      guideMaterial.opacity = .2 * (1 - ease(progress, .05, .75));
      // Ease the viewpoint toward the finished object without changing scroll speed.
      const finish = ease(progress, .55, 1);
      camera.position.set(6.2 - finish * .5, 6.4 + finish * .5, 8.8);
      camera.lookAt(0, 1.55 - finish * 1.25, 0);
      const aspect = width / Math.max(1, height);
      const halfHeight = Math.max(2.65, 2.9 / aspect) - finish * .3;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item));
      });
      materials.forEach(item => { if (item.map) textures.add(item.map); item.dispose(); });
      textures.forEach(item => item.dispose()); geometries.forEach(item => item.dispose());
      environmentTarget.dispose(); renderer.dispose();
    },
  };
}
