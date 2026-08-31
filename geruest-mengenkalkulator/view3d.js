"use strict";

// Schematic 3D view of the scaffold: posts, decks per level, guardrails and
// consoles, built along the reconstructed building geometry. Not
// component-accurate — a lightweight visual aid, not a model for statics.

const View3D = (() => {
  const statusEl = document.getElementById("view3d-status");
  const canvas = document.getElementById("view3d-canvas");

  const MAX_MESHES = 4000;

  let renderer = null;
  let scene = null;
  let camera = null;
  let available = typeof THREE !== "undefined";

  let azimuth = Math.PI / 4;
  let elevation = Math.PI / 6;
  let radius = 30;
  let target = { x: 0, y: 0, z: 0 };
  let dragging = false;
  let lastPointer = null;

  if (!available) {
    if (statusEl) {
      statusEl.textContent =
        "3D-Bibliothek (vendor/three.min.js) konnte nicht geladen werden – 3D-Ansicht nicht verfügbar. Der 2D-Lageplan und alle Mengenberechnungen funktionieren unabhängig davon.";
    }
    return { render: () => {} };
  }

  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef1f4);

    camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 2000);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dir1.position.set(10, 20, 10);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-10, 10, -10);
    scene.add(dir2);

    const grid = new THREE.GridHelper(60, 30, 0xc7ccd3, 0xdfe3e8);
    scene.add(grid);

    attachControls();
    resize();
    animate();
  }

  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function updateCamera() {
    const x = target.x + radius * Math.cos(elevation) * Math.sin(azimuth);
    const y = target.y + radius * Math.sin(elevation);
    const z = target.z + radius * Math.cos(elevation) * Math.cos(azimuth);
    camera.position.set(x, y, z);
    camera.lookAt(target.x, target.y, target.z);
  }

  function attachControls() {
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });
    canvas.addEventListener("pointerleave", () => {
      dragging = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !lastPointer) return;
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      azimuth -= dx * 0.007;
      elevation = Math.min(Math.PI / 2 - 0.05, Math.max(0.08, elevation + dy * 0.007));
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        radius = Math.min(300, Math.max(3, radius * (1 + e.deltaY * 0.001)));
      },
      { passive: false }
    );
    window.addEventListener("resize", resize);
  }

  function animate() {
    requestAnimationFrame(animate);
    updateCamera();
    renderer.render(scene, camera);
  }

  function clearScene() {
    for (let i = scene.children.length - 1; i >= 0; i -= 1) {
      const child = scene.children[i];
      if (child.isLight || child.isGridHelper) continue;
      scene.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }

  function box(w, h, d, color, opacity) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity !== undefined, opacity: opacity ?? 1 });
    return new THREE.Mesh(geo, mat);
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Maps a plan-space point {x,y} to three.js world space (x, 0, z).
  const toWorld = (p, y = 0) => new THREE.Vector3(p.x, y, -p.y);

  function addPostRow(group, ringFrame, felder, heightM, color) {
    for (let j = 0; j <= felder; j += 1) {
      const t = felder === 0 ? 0 : j / felder;
      const p = lerp(ringFrame.a, ringFrame.b, t);
      const post = box(0.05, heightM, 0.05, color);
      const w = toWorld(p, heightM / 2);
      post.position.copy(w);
      group.add(post);
    }
  }

  function buildingVolume(ring, closed, heightM) {
    if (!closed || ring.length < 3) return null;
    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: heightM, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function render(results) {
    if (!available) return;
    if (!renderer) initScene();
    clearScene();
    if (statusEl) statusEl.textContent = "";

    const geometry = results.geometry;
    if (!geometry || geometry.ring.length < 2) {
      if (statusEl) {
        statusEl.textContent =
          'Aktiviere "Abschnitte bilden einen zusammenhängenden Rundgang" in den Einstellungen, um eine 3D-Ansicht zu erzeugen.';
      }
      return;
    }

    const perSection = results.perSection;
    const closed = geometry.closed;
    const staenderFrames = Geometry.edgeFrames(geometry.staenderRing, closed);
    const baseOuterFrames = Geometry.edgeFrames(geometry.baseOuterRing, closed);
    const outerFrames = Geometry.edgeFrames(geometry.outerRing, closed);
    const lagenhoehe = results.settings.lagenhoehe;

    const group = new THREE.Group();

    const maxHeight = Math.max(...perSection.map((s) => s.height), 1);
    const vol = buildingVolume(geometry.ring, closed, maxHeight);
    if (vol) group.add(vol);

    let meshCount = 0;
    const overBudget = () => meshCount > MAX_MESHES;

    perSection.forEach((s, i) => {
      if (overBudget()) return;
      const innerFrame = staenderFrames[i];
      const outerFrame = baseOuterFrames[i];
      const konsoleFrame = outerFrames[i];
      if (!innerFrame || !outerFrame) return;
      const totalHeight = s.lagen * lagenhoehe;

      addPostRow(group, innerFrame, s.felder, totalHeight, 0x4a5568);
      addPostRow(group, outerFrame, s.felder, totalHeight, 0x4a5568);
      meshCount += 2 * (s.felder + 1);

      for (let k = 1; k <= s.lagen; k += 1) {
        if (overBudget()) break;
        const y = k * lagenhoehe;
        const midInner = lerp(innerFrame.a, innerFrame.b, 0.5);
        const midOuter = lerp(outerFrame.a, outerFrame.b, 0.5);
        const deckWidth = Math.hypot(midOuter.x - midInner.x, midOuter.y - midInner.y);
        const deckCenter = lerp(midInner, midOuter, 0.5);
        // rotation.y aligns the box's local X axis (its "length") with the
        // edge direction, mapped into three.js world space (x, -y).
        const angle = Math.atan2(innerFrame.dir.y, innerFrame.dir.x);

        const deck = box(innerFrame.length, 0.06, deckWidth, 0xd7a06b);
        deck.rotation.y = angle;
        deck.position.copy(toWorld(deckCenter, y));
        group.add(deck);
        meshCount += 1;

        const rail = box(innerFrame.length, 0.05, 0.05, 0xc0392b);
        rail.rotation.y = angle;
        rail.position.copy(toWorld(midOuter, y + 1.0));
        group.add(rail);
        meshCount += 1;

        if (s.konsole && konsoleFrame) {
          const midKonsole = lerp(konsoleFrame.a, konsoleFrame.b, 0.5);
          const konsoleWidth = Math.hypot(midKonsole.x - midOuter.x, midKonsole.y - midOuter.y);
          if (konsoleWidth > 0.01) {
            const konsoleCenter = lerp(midOuter, midKonsole, 0.5);
            const shelf = box(innerFrame.length, 0.04, konsoleWidth, 0xe08e45);
            shelf.rotation.y = angle;
            shelf.position.copy(toWorld(konsoleCenter, y));
            group.add(shelf);
            meshCount += 1;
          }
        }
      }
    });

    scene.add(group);

    const b = Geometry.bounds([geometry.outerRing, geometry.ring]);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    target = { x: cx, y: maxHeight / 2, z: -cy };
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 5);
    radius = span * 1.4 + maxHeight;

    if (overBudget() && statusEl) {
      statusEl.textContent = "Hinweis: Sehr viele Bauteile – 3D-Ansicht wurde zur Performance gekürzt dargestellt.";
    }
  }

  return { render };
})();
