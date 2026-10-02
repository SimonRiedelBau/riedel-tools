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
    return { renderStories: () => {}, refresh: () => {}, onSelect: () => {}, onHandle: () => {}, getSelection: () => null, select: () => {} };
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

  // ---------------------------------------------------------------
  // Auswahl und Anfasser (Bearbeitung direkt in 3D, siehe editor3d.js)
  // ---------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const SELECT_COLOR = 0x2f6fe0;
  let selection = null; // { storyId, srcIndex }
  let sectionGroups = []; // alle Abschnitts-Gruppen der Szene
  let handles = []; // Kugeln für Start/Ende des gewählten Abschnitts
  let handleDrag = null; // { kind, mesh, plane, value }
  let downPos = null;
  const listeners = { select: [], handle: [] };
  const emit = (type, ...args) => listeners[type].forEach((cb) => cb(...args));

  const dragLabel = document.createElement("div");
  dragLabel.className = "view3d-drag-label hidden";
  canvas.parentElement.appendChild(dragLabel);

  function pointerNdc(e) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function pickSection(e) {
    raycaster.setFromCamera(pointerNdc(e), camera);
    const hits = raycaster.intersectObjects(sectionGroups, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick;
    }
    return null;
  }

  function pickHandle(e) {
    if (!handles.length) return null;
    raycaster.setFromCamera(pointerNdc(e), camera);
    const hit = raycaster.intersectObjects(handles, false)[0];
    return hit ? hit.object : null;
  }

  function startHandleDrag(mesh) {
    // senkrechte Ebene durch den Anfasser, zur Kamera gedreht
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, mesh.position.clone());
    handleDrag = { kind: mesh.userData.handle, mesh, plane, value: mesh.position.y };
  }

  function moveHandle(e) {
    raycaster.setFromCamera(pointerNdc(e), camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(handleDrag.plane, hit)) return;
    const info = handleDrag.mesh.userData.info;
    let v = Math.round(hit.y / 0.05) * 0.05;
    if (handleDrag.kind === "end") v = Math.max(info.startAbs + 0.5, v);
    else v = Math.min(info.endAbs - 0.5, Math.max(0, v));
    handleDrag.value = v;
    handleDrag.mesh.position.y = v;
    const r = canvas.getBoundingClientRect();
    dragLabel.textContent = `${handleDrag.kind === "end" ? "Ende" : "Start"}: ${v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    dragLabel.style.left = `${e.clientX - r.left + 14}px`;
    dragLabel.style.top = `${e.clientY - r.top - 10}px`;
    dragLabel.classList.remove("hidden");
  }

  function applySelectionLook() {
    sectionGroups.forEach((g) => {
      const on = selection && g.userData.pick.storyId === selection.storyId && g.userData.pick.srcIndex === selection.srcIndex;
      g.traverse((o) => {
        if (!o.material || !o.material.color) return;
        if (o.userData.baseColor === undefined) o.userData.baseColor = o.material.color.getHex();
        o.material.color.setHex(on ? SELECT_COLOR : o.userData.baseColor);
      });
    });
    handles.forEach((h) => {
      scene.remove(h);
      h.geometry.dispose();
      h.material.dispose();
    });
    handles = [];
    const g = selection && sectionGroups.find((x) => x.userData.pick.storyId === selection.storyId && x.userData.pick.srcIndex === selection.srcIndex);
    if (!g) return;
    const info = g.userData.info;
    [["start", info.startAbs, 0x2a9d5b], ["end", info.endAbs, 0x1e5bd8]].forEach(([kind, y, color]) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.18, radius * 0.008), 20, 14),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })
      );
      m.renderOrder = 10;
      m.position.copy(toWorld(info.handleAt, y));
      m.userData = { handle: kind, info };
      scene.add(m);
      handles.push(m);
    });
  }

  function setSelection(sel, silent) {
    selection = sel;
    applySelectionLook();
    if (!silent) emit("select", selection);
  }

  function attachControls() {
    canvas.addEventListener("pointerdown", (e) => {
      downPos = { x: e.clientX, y: e.clientY };
      lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      const h = pickHandle(e);
      if (h) {
        startHandleDrag(h);
        return;
      }
      dragging = true;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (handleDrag) {
        const { kind, value } = handleDrag;
        handleDrag = null;
        dragLabel.classList.add("hidden");
        emit("handle", selection, kind, value);
        return;
      }
      dragging = false;
      // Klick ohne Ziehen = Abschnitt auswählen (oder Auswahl aufheben)
      if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 5) setSelection(pickSection(e));
      downPos = null;
    });
    canvas.addEventListener("pointerleave", () => {
      dragging = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (handleDrag) {
        moveHandle(e);
        return;
      }
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

  // Eingelesenes 3D-Modell (aus modell3d.js), wird zwischengespeichert und
  // nur neu aufgebaut, wenn ein anderes Modell übernommen wurde.
  const modelToggle = document.getElementById("view3d-model-toggle");
  const modelToggleLabel = document.getElementById("view3d-model-toggle-label");
  let modelObj = null;
  let modelSource = null;
  let lastArgs = null;

  function buildModelObject(model) {
    // model.local: Plan-Koordinaten relativ zu Bezugspunkt/Gelände
    // (x Ost, y Nord, z oben) → three.js (x, z oben, -y)
    const src = model.local;
    const n = src.length / 3;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = src[i * 3];
      pos[i * 3 + 1] = src[i * 3 + 2];
      pos[i * 3 + 2] = -src[i * 3 + 1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const group = new THREE.Group();
    group.userData.keep = true;
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: 0xc9ced6, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })));
    if (n / 3 <= 400000) {
      const edges = new THREE.EdgesGeometry(geo, 25);
      group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x6b7480 })));
    }
    return group;
  }

  function currentModel() {
    if (typeof Model3DPlanner === "undefined" || !Model3DPlanner.getAppliedModel) return null;
    return Model3DPlanner.getAppliedModel();
  }

  if (modelToggle) {
    modelToggle.addEventListener("change", () => {
      if (lastArgs) renderStories(...lastArgs);
    });
  }

  function clearScene() {
    sectionGroups = [];
    handles = [];
    for (let i = scene.children.length - 1; i >= 0; i -= 1) {
      const child = scene.children[i];
      if (child.isLight || child.isGridHelper) continue;
      scene.remove(child);
      if (child.userData && child.userData.keep) continue;
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

  function addPostRow(group, ringFrame, felder, heightM, color, baseY = 0) {
    for (let j = 0; j <= felder; j += 1) {
      const t = felder === 0 ? 0 : j / felder;
      const p = lerp(ringFrame.a, ringFrame.b, t);
      const post = box(0.05, heightM, 0.05, color);
      const w = toWorld(p, baseY + heightM / 2);
      post.position.copy(w);
      group.add(post);
    }
  }

  function buildingVolume(ring, closed, heightM) {
    if (!closed || ring.length < 3) return null;
    // Nach rotateX(-90°) wird Shape-y zu Welt -z – passend zu toWorld (z = -y).
    // (Früher stand hier -p.y; dadurch lag der Körper gespiegelt neben dem Gerüst.)
    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: heightM, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  // Builds one story's scaffold as a THREE.Group at local y=0 (the caller
  // translates it up by that story's Sockelhöhe). budget is a {count} object
  // shared across stories so the overall scene stays within MAX_MESHES.
  // sockel: Sockelhöhe des Geschosses; Abschnitte mit abweichender
  // Starthöhe (startAbs) werden innerhalb der Gruppe entsprechend versetzt.
  // showVolume=false, wenn das echte 3D-Modell als Gebäude angezeigt wird.
  function buildStoryGroup(result, lagenhoehe, budget, sockel = 0, showVolume = true, storyId = null) {
    const group = new THREE.Group();
    const geometry = result.geometry;
    const perSection = result.perSection;
    const closed = geometry.closed;
    const staenderFrames = Geometry.edgeFrames(geometry.staenderRing, closed);
    const baseOuterFrames = Geometry.edgeFrames(geometry.baseOuterRing, closed);
    const outerFrames = Geometry.edgeFrames(geometry.outerRing, closed);

    const maxHeight = Math.max(...perSection.map((s) => (s.endAbs ?? sockel + s.height) - sockel), 1);
    const vol = showVolume ? buildingVolume(geometry.ring, closed, maxHeight) : null;
    if (vol) group.add(vol);

    const overBudget = () => budget.count > MAX_MESHES;

    perSection.forEach((s, i) => {
      if (overBudget()) return;
      const innerFrame = staenderFrames[i];
      const outerFrame = baseOuterFrames[i];
      const konsoleFrame = outerFrames[i];
      if (!innerFrame || !outerFrame) return;
      const totalHeight = s.lagen * lagenhoehe;
      const baseY = (s.startAbs ?? sockel) - sockel;

      // eigene Gruppe je Abschnitt → anklickbar in der 3D-Ansicht
      const secGroup = new THREE.Group();
      secGroup.userData.pick = { storyId, srcIndex: s.srcIndex ?? i };
      secGroup.userData.info = {
        startAbs: s.startAbs ?? sockel,
        endAbs: s.endAbs ?? sockel + s.height,
        handleAt: lerp(outerFrame.a, outerFrame.b, 0.5),
      };
      group.add(secGroup);
      sectionGroups.push(secGroup);

      addPostRow(secGroup, innerFrame, s.felder, totalHeight, 0x4a5568, baseY);
      addPostRow(secGroup, outerFrame, s.felder, totalHeight, 0x4a5568, baseY);
      budget.count += 2 * (s.felder + 1);

      for (let k = 1; k <= s.lagen; k += 1) {
        if (overBudget()) break;
        const y = baseY + k * lagenhoehe;
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
        secGroup.add(deck);
        budget.count += 1;

        const rail = box(innerFrame.length, 0.05, 0.05, 0xc0392b);
        rail.rotation.y = angle;
        rail.position.copy(toWorld(midOuter, y + 1.0));
        secGroup.add(rail);
        budget.count += 1;

        if (s.konsole && konsoleFrame) {
          const midKonsole = lerp(konsoleFrame.a, konsoleFrame.b, 0.5);
          const konsoleWidth = Math.hypot(midKonsole.x - midOuter.x, midKonsole.y - midOuter.y);
          if (konsoleWidth > 0.01) {
            const konsoleCenter = lerp(midOuter, midKonsole, 0.5);
            const shelf = box(innerFrame.length, 0.04, konsoleWidth, 0xe08e45);
            shelf.rotation.y = angle;
            shelf.position.copy(toWorld(konsoleCenter, y));
            secGroup.add(shelf);
            budget.count += 1;
          }
        }
      }
    });

    return group;
  }

  // storyResults: [{ story, result, sockelhoehe }], as produced by
  // calculateAllStories() in script.js. Stacks each story's scaffold group
  // at its own Sockelhöhe and fits the camera around the combined bounds.
  function renderStories(storyResults, globalSettings, opts = {}) {
    if (!available) return;
    if (!renderer) initScene();
    clearScene();
    lastArgs = [storyResults, globalSettings, { keepCamera: true }];
    if (statusEl) statusEl.textContent = "";

    // passt die Geschoss-Lage zum übernommenen Modell? (nur dann anzeigen)
    const model = currentModel();
    const placed = storyResults.some((sr) => sr.story.placement);
    if (modelToggleLabel) modelToggleLabel.classList.toggle("hidden", !(model && placed));
    if (placed && !model && statusEl) {
      statusEl.textContent =
        "Das 3D-Modell zu diesem Gerüst ist in diesem Browser nicht gespeichert – oben unter „3D-Modell → Gerüst automatisch planen“ die Datei erneut einlesen und übernehmen, dann wird das Gerüst im echten Modell angezeigt.";
    }
    const showModel = Boolean(model && placed && (!modelToggle || modelToggle.checked));
    if (showModel) {
      if (modelSource !== model) {
        if (modelObj) modelObj.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
        modelObj = buildModelObject(model);
        modelSource = model;
      }
      scene.add(modelObj);
    }

    const valid = storyResults.filter((sr) => sr.result.geometry && sr.result.geometry.ring.length >= 2);
    if (!valid.length) {
      if (statusEl) {
        statusEl.textContent =
          'Aktiviere "Abschnitte bilden einen zusammenhängenden Rundgang" in mindestens einem Geschoss, um eine 3D-Ansicht zu erzeugen.';
      }
      return;
    }

    const budget = { count: 0 };
    const allPoints = [];
    let maxTop = 0;

    valid.forEach((sr) => {
      const sockel = sr.sockelhoehe || 0;
      const group = buildStoryGroup(sr.result, globalSettings.lagenhoehe, budget, sockel, !showModel, sr.story.id);
      group.position.y = sockel;
      scene.add(group);
      allPoints.push(...sr.result.geometry.outerRing, ...sr.result.geometry.ring);
      const storyTop = Math.max(...sr.result.perSection.map((s) => s.endAbs ?? sockel + s.height), sockel + 1);
      maxTop = Math.max(maxTop, storyTop);
    });

    // matrixWorld für die Auswahl per Mausklick aktualisieren
    scene.updateMatrixWorld(true);

    if (!opts.keepCamera) {
      const b = Geometry.bounds([allPoints]);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      target = { x: cx, y: maxTop / 2, z: -cy };
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 5);
      radius = span * 1.4 + maxTop;
    }

    // Auswahl nach dem Neuzeichnen beibehalten, falls der Abschnitt noch existiert
    const stillThere = selection && sectionGroups.some((g) => g.userData.pick.storyId === selection.storyId && g.userData.pick.srcIndex === selection.srcIndex);
    if (selection && !stillThere) setSelection(null);
    else setSelection(selection, true);

    if (budget.count > MAX_MESHES && statusEl) {
      statusEl.textContent = "Hinweis: Sehr viele Bauteile – 3D-Ansicht wurde zur Performance gekürzt dargestellt.";
    }
  }

  // erneut zeichnen (z. B. wenn das gespeicherte 3D-Modell nachgeladen wurde)
  function refresh() {
    if (lastArgs) renderStories(...lastArgs);
  }

  return {
    renderStories,
    refresh,
    onSelect: (cb) => listeners.select.push(cb),
    onHandle: (cb) => listeners.handle.push(cb),
    getSelection: () => selection,
    select: (sel) => setSelection(sel),
  };
})();
