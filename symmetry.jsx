/**
 * Radial-8 symmetry (fixed base wedge) — CS6
 * - Base wedge: LEFT-UPPER (180° -> 135° from document center)
 * - Draw inside the wedge on "PAINT_HERE" (raster layer).
 * - Duplicates content into 8 sectors, rotating about the EXACT document center.
 *
 * Visuals (non-printing):
 *   - Persistent wedge selection (marching ants) to enforce painting region.
 *   - Path overlay for the two diagonals + tiny center cross (NO RING).
 *   - No blue guides are created; any center guides from earlier runs are removed.
 *
 * Error 8800 avoidance:
 *   - Skip transforms on empty/non-raster layers.
 *   - Deselect pixel selections before each transform.
 *   - Use FTcs/Qcsi + Pstn + Ofst for exact document-center pivot.
 */

#target photoshop
app.bringToFront();

(function () {
    // ======= CONFIG =======
    var SHOW_OVERLAY_PATHS       = true;   // Path overlay (diagonals/cross)
    var FORCE_PATH_TOOL_VISIBLE  = true;   // Keep path outlines visible
    var KEEP_WEDGE_SELECTION_ON  = true;   // Persistent marching ants
    // NO RING and NO GUIDES (as requested)

    // Wedge angles (degrees)
    var DEG1 = 180.0;    // left (horizontal)
    var DEG2 = 135.0;    // up-left diagonal

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
    function deleteGroupIfExists(name) {
        var d = app.activeDocument;
        for (var i = d.layerSets.length - 1; i >= 0; i--) { if (d.layerSets[i].name === name) { d.layerSets[i].remove(); } }
    }
    function newGroupAbove(ref, name) {
        var g = app.activeDocument.layerSets.add(); g.name = name; g.move(ref, ElementPlacement.PLACEAFTER); return g;
    }

    // ======= GUIDES: remove old center guides (no new guides created) =======
    function removeCenterGuidesIfPresent() {
        var d = app.activeDocument, prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;
        try {
            var cx = d.width.as('px') / 2, cy = d.height.as('px') / 2;
            var tol = 0.5; // px tolerance
            // iterate from end because removing mutates the list
            for (var i = d.guides.length - 1; i >= 0; i--) {
                var g = d.guides[i];
                try {
                    var val = g.coordinate.as('px');
                    if (g.direction === Direction.VERTICAL && Math.abs(val - cx) <= tol) { g.remove(); }
                    else if (g.direction === Direction.HORIZONTAL && Math.abs(val - cy) <= tol) { g.remove(); }
                } catch (e) { /* ignore */ }
            }
        } finally { app.preferences.rulerUnits = prev; }
    }

    // ======= PATH OVERLAY (non-printing, NO RING) =======
    function addOverlayPaths() {
        if (!SHOW_OVERLAY_PATHS) { return; }
        var d = app.activeDocument, prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;

        // delete old overlay path if present
        try { d.pathItems.getByName("__RADIAL_PATHS__").remove(); } catch (e) {}

        try {
            var w = d.width.as('px'), h = d.height.as('px');
            var cx = w / 2, cy = h / 2;
            var R  = Math.sqrt(w * w + h * h) * 1.2; // extend beyond canvas

            function ptFromAngle(deg, radius) {
                var rad = deg * Math.PI / 180.0;
                return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)]; // canvas Y down
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
            // Diagonal borders (rays)
            subs.push(makeLine(ptFromAngle(DEG1, 0.0), ptFromAngle(DEG1, R)));
            subs.push(makeLine(ptFromAngle(DEG2, 0.0), ptFromAngle(DEG2, R)));
            // Tiny center cross
            var crossLen = Math.max(6, Math.min(w, h) * 0.01);
            subs.push(makeLine([cx - crossLen, cy], [cx + crossLen, cy]));
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

    // ======= WEDGE SELECTION (persistent marching ants) =======
    function selectLeftUpperWedge(replace) {
        var d = app.activeDocument, prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;
        try {
            var w = d.width.as('px'), h = d.height.as('px'), cx = w / 2, cy = h / 2, R = Math.sqrt(w * w + h * h) * 2;
            function pt(deg) { var rad = deg * Math.PI / 180.0; return [cx + R * Math.cos(rad), cy - R * Math.sin(rad)]; }
            var p180 = pt(DEG1), p135 = pt(DEG2);
            d.selection.select([[cx, cy], p180, p135], replace ? SelectionType.REPLACE : SelectionType.EXTEND, 0, true);
        } finally { app.preferences.rulerUnits = prev; }
    }
    function enforceWedgeOnLayerPixels() {
        var d = app.activeDocument;
        selectLeftUpperWedge(true);        // triangular wedge selection
        d.selection.invert();              // anything outside
        d.selection.clear();               // clear outside the wedge
        d.selection.deselect();            // leave no selection during transforms
    }

    // ======= DOCUMENT-CENTER ROTATION (avoids error 8800) =======
    function rotateLayerAboutDocCenter(layer, degrees) {
        if (!isRasterArtLayer(layer) || !hasPixels(layer)) { return; }
        var d = app.activeDocument;
        d.selection.deselect();
        d.activeLayer = layer;

        var cx = d.width.as('px') / 2;
        var cy = d.height.as('px') / 2;

        var idTrnf = charIDToTypeID("Trnf");
        var desc = new ActionDescriptor();

        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        // independent transform center
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

    // ======= MAIN =======
    function run() {
        assertDoc();

        // Remove any center guides that may have been created by earlier versions
        removeCenterGuidesIfPresent();

        // Draw/update non-printing overlay (diagonals + cross only)
        addOverlayPaths();

        var d = app.activeDocument;
        var base = ensurePaintLayer();

        // Enforce wedge on the source content
        d.activeLayer = base;
        enforceWedgeOnLayerPixels();

        if (!hasPixels(base)) {
            deleteGroupIfExists("Mirrors_8");
            alert("Nothing in the left-upper wedge on 'PAINT_HERE'. Draw there, then run again.");
            if (KEEP_WEDGE_SELECTION_ON) { selectLeftUpperWedge(true); }
            return;
        }

        // Build rotated copies
        deleteGroupIfExists("Mirrors_8");
        var grp = newGroupAbove(base, "Mirrors_8");

        for (var k = 0; k < 8; k++) {
            var dup = base.duplicate(); dup.name = "Sector_" + k;
            dup.move(grp, ElementPlacement.INSIDE);
            rotateLayerAboutDocCenter(dup, 45 * k);
        }

        // Persistent visuals
        if (KEEP_WEDGE_SELECTION_ON) { selectLeftUpperWedge(true); } else { d.selection.deselect(); }
        if (SHOW_OVERLAY_PATHS) {
            try { d.pathItems.getByName("__RADIAL_PATHS__").select(); } catch (e) {}
            if (FORCE_PATH_TOOL_VISIBLE) { try { app.currentTool = 'pathComponentSelectTool'; } catch (eTool) {} }
        }
    }

    app.activeDocument.suspendHistory("Radial-8 (no ring, no guides)", "run()");
})();
