/**
 * Radial-8 symmetry (Fold + Expand, no masks) — CS6
 *
 * Draw anywhere on "PAINT_HERE". The script:
 * 1) FOLD: for k=0..7, duplicates PAINT_HERE, rotates by -45*k to map sector k
 *    into the base wedge (180°->135°), then SELECT wedge → INVERT → CLEAR
 *    to keep only wedge pixels. Merges all folded copies.
 * 2) EXPAND: duplicates the merged folded layer 8×, rotating by +45*k.
 *
 * Visuals (non-printing):
 *  - Path overlay for the two wedge borders + tiny center cross (NO ring, NO guides).
 *  - No persistent pixel selection (painting is NOT constrained).
 *
 * Error 8800 avoidance:
 *  - No layer masks; only selections + clear on temporary layers.
 *  - Skip transforms on empty/non-raster layers; deselect before transforms.
 *  - Use FTcs/Qcsi + Pstn + Ofst for document-center pivot.
 *
 * Safety:
 *  - Re-selects PAINT_HERE at the end so the user keeps drawing on the safe layer.
 */

#target photoshop
app.bringToFront();

(function () {
    // ======= CONFIG =======
    var SHOW_OVERLAY_PATHS      = true;   // show non-printing wedge borders + cross
    var FORCE_PATH_TOOL_VISIBLE = true;   // keep path outlines visible by switching tool

    // Wedge angles (degrees)
    var DEG1 = 180.0;    // left (horizontal)
    var DEG2 = 135.0;    // up-left diagonal
    var STEP = 45.0;     // 8 sectors

    // ======= BASIC UTILS =======
    function assertDoc() {
        if (!app.documents.length) { alert("Open a document first."); throw new Error("No document"); }
        var m = app.activeDocument.mode;
        if (m === DocumentMode.INDEXEDCOLOR || m === DocumentMode.BITMAP) {
            alert("Convert to RGB or Grayscale first."); throw new Error("Unsupported mode");
        }
    }
    function isRasterArtLayer(L) { return L && L.typename === "ArtLayer" && L.kind === LayerKind.NORMAL; }
    function hasPixels(L) {
        try { var b = L.bounds; return (b[2].as('px') > b[0].as('px') && b[3].as('px') > b[1].as('px')); }
        catch (e) { return false; }
    }
    function ensurePaintLayer() {
        var d = app.activeDocument;
        for (var i = 0; i < d.layers.length; i++) {
            var L = d.layers[i];
            if (isRasterArtLayer(L) && L.name === "PAINT_HERE") { return L; }
        }
        var lay = d.artLayers.add(); lay.name = "PAINT_HERE"; lay.kind = LayerKind.NORMAL; return lay;
    }
    function selectPaintLayer() {
        var d = app.activeDocument;
        for (var i = 0; i < d.layers.length; i++) {
            var L = d.layers[i];
            if (isRasterArtLayer(L) && L.name === "PAINT_HERE") { d.activeLayer = L; return L; }
        }
        return null;
    }
    function deleteGroupIfExists(name) {
        var d = app.activeDocument;
        for (var i = d.layerSets.length - 1; i >= 0; i--) { if (d.layerSets[i].name === name) { d.layerSets[i].remove(); } }
    }
    function newGroupAbove(ref, name) {
        var g = app.activeDocument.layerSets.add(); g.name = name; g.move(ref, ElementPlacement.PLACEAFTER); return g;
    }
    function deselectAll() { try { app.activeDocument.selection.deselect(); } catch (e) {} }

    // ======= PATH OVERLAY (non-printing) =======
    function addOverlayPaths() {
        if (!SHOW_OVERLAY_PATHS) { return; }
        var d = app.activeDocument, prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;

        try { d.pathItems.getByName("__RADIAL_PATHS__").remove(); } catch (e) {}

        try {
            var w = d.width.as('px'), h = d.height.as('px');
            var cx = w / 2, cy = h / 2;
            var R  = Math.sqrt(w * w + h * h) * 1.2;

            function ptFromAngle(deg, radius) {
                var rad = deg * Math.PI / 180.0;
                return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)];
            }
            function makeLine(p0, p1) {
                var pA = new PathPointInfo(), pB = new PathPointInfo();
                pA.kind = PointKind.CORNERPOINT; pB.kind = PointKind.CORNERPOINT;
                pA.anchor = pA.leftDirection = pA.rightDirection = p0;
                pB.anchor = pB.leftDirection = pB.rightDirection = p1;
                var s = new SubPathInfo(); s.closed = false; s.operation = ShapeOperation.SHAPEXOR;
                s.entireSubPath = [pA, pB]; return s;
            }

            var subs = [];
            subs.push(makeLine(ptFromAngle(DEG1, 0.0), ptFromAngle(DEG1, R))); // border 1
            subs.push(makeLine(ptFromAngle(DEG2, 0.0), ptFromAngle(DEG2, R))); // border 2
            var crossLen = Math.max(6, Math.min(w, h) * 0.01);
            subs.push(makeLine([cx - crossLen, cy], [cx + crossLen, cy]));      // center cross
            subs.push(makeLine([cx, cy - crossLen], [cx, cy + crossLen]));

            d.pathItems.add("__RADIAL_PATHS__", subs);
            try { d.pathItems.getByName("__RADIAL_PATHS__").select(); } catch (eSel) {}
        } finally {
            app.preferences.rulerUnits = prev;
        }

        if (FORCE_PATH_TOOL_VISIBLE) {
            try { app.currentTool = 'pathComponentSelectTool'; } catch (eTool) {}
        }
    }

    // ======= WEDGE SELECTION (temporary; no persistence) =======
    function selectLeftUpperWedge(replace) {
        var d = app.activeDocument, prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;
        try {
            var w = d.width.as('px'), h = d.height.as('px'), cx = w / 2, cy = h / 2, R = Math.sqrt(w * w + h * h) * 2;
            function pt(deg) { var rad = deg * Math.PI / 180.0; return [cx + R * Math.cos(rad), cy - R * Math.sin(rad)]; }
            var p180 = pt(DEG1), p135 = pt(DEG2);
            d.selection.select([[cx, cy], p180, p135], replace ? SelectionType.REPLACE : SelectionType.EXTEND, 0, true);
        } finally { app.preferences.rulerUnits = prev; }
    }

    // ======= DOCUMENT-CENTER ROTATION =======
    function rotateLayerAboutDocCenter(layer, degrees) {
        if (!isRasterArtLayer(layer) || !hasPixels(layer)) { return; } // avoid 8800
        var d = app.activeDocument;
        deselectAll();
        d.activeLayer = layer;

        var cx = d.width.as('px') / 2;
        var cy = d.height.as('px') / 2;

        var idTrnf = charIDToTypeID("Trnf");
        var desc = new ActionDescriptor();

        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        // independent transform center (Qcsi)
        desc.putEnumerated(charIDToTypeID("FTcs"),
                           charIDToTypeID("QCSt"),
                           charIDToTypeID("Qcsi"));

        // pivot at document center
        var pDesc = new ActionDescriptor();
        pDesc.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), cx);
        pDesc.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), cy);
        desc.putObject(charIDToTypeID("Pstn"), charIDToTypeID("Pnt "), pDesc);

        // zero offset
        var oDesc = new ActionDescriptor();
        oDesc.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0.0);
        oDesc.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0.0);
        desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), oDesc);

        // rotation angle
        desc.putUnitDouble(charIDToTypeID("Angl"), charIDToTypeID("#Ang"), degrees);

        executeAction(idTrnf, desc, DialogModes.NO);
    }

    // ======= FOLD: rotate each sector into base wedge, then trim outside wedge =======
    function buildFoldedLayerFrom(baseLayer) {
        var d = app.activeDocument;

        deleteGroupIfExists("__FoldToBase__");
        var foldGroup = newGroupAbove(baseLayer, "__FoldToBase__");

        for (var k = 0; k < 8; k++) {
            var dup = baseLayer.duplicate(); dup.name = "Fold_" + k;
            dup.move(foldGroup, ElementPlacement.INSIDE);

            rotateLayerAboutDocCenter(dup, -STEP * k);

            // Keep only the wedge area (no masks; destructive clear outside)
            d.activeLayer = dup;
            selectLeftUpperWedge(true);   // select wedge
            d.selection.invert();         // select outside wedge
            d.selection.clear();          // clear outside
            deselectAll();

            if (!hasPixels(dup)) { dup.remove(); }
        }

        if (foldGroup.layers.length === 0) { foldGroup.remove(); return null; }

        var folded = foldGroup.merge();   // temporary consolidated wedge content
        folded.name = "PAINT_FOLDED";
        return folded;
    }

    // ======= MAIN =======
    function run() {
        assertDoc();
        addOverlayPaths(); // non-printing lines only

        var d = app.activeDocument;
        var base = ensurePaintLayer();

        if (!hasPixels(base)) {
            deleteGroupIfExists("Mirrors_8");
            deleteGroupIfExists("__FoldToBase__");
            alert("Nothing to process on 'PAINT_HERE'. Draw anywhere; the script will fold and expand.");
            selectPaintLayer();
            return;
        }

        // 1) FOLD
        var folded = buildFoldedLayerFrom(base);
        if (!folded || !hasPixels(folded)) {
            deleteGroupIfExists("Mirrors_8");
            alert("No visible pixels overlapped the base wedge after folding.");
            selectPaintLayer();
            return;
        }

        // 2) EXPAND
        deleteGroupIfExists("Mirrors_8");
        var grp = newGroupAbove(folded, "Mirrors_8");

        for (var k = 0; k < 8; k++) {
            var dup = folded.duplicate(); dup.name = "Sector_" + k;
            dup.move(grp, ElementPlacement.INSIDE);
            rotateLayerAboutDocCenter(dup, STEP * k);
        }

        // remove intermediate folded source
        try { folded.remove(); } catch (e) {}

        // keep overlay visible
        if (SHOW_OVERLAY_PATHS) {
            try { d.pathItems.getByName("__RADIAL_PATHS__").select(); } catch (e) {}
            if (FORCE_PATH_TOOL_VISIBLE) { try { app.currentTool = 'pathComponentSelectTool'; } catch (eTool) {} }
        }

        // end on PAINT_HERE for safe painting
        selectPaintLayer();
        deselectAll(); // ensure no selection constrains painting
    }

    app.activeDocument.suspendHistory("Radial-8 (Fold+Expand, no masks)", "run()");
})();
