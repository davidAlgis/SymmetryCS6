/**
 * Radial-8 symmetry (fixed base wedge) — CS6
 * Base wedge: LEFT-UPPER (angles 180° -> 135° from the document center)
 * Draw only on top-level raster layer "PAINT_HERE" inside that wedge.
 * Run to duplicate it into all 8 wedges by rotating about the exact DOCUMENT CENTER.
 * Includes a debug overlay (crosshair + ring) to visualize the pivot.
 */

#target photoshop
app.bringToFront();

(function () {

    // ======= CONFIG =======
    var DEBUG = true;   // set to false to skip drawing the crosshair/ring

    // ======= BASIC UTILS =======
    function assertDoc() {
        if (!app.documents.length) { alert("Open a document first."); throw new Error("No document"); }
        var m = app.activeDocument.mode;
        if (m === DocumentMode.INDEXEDCOLOR || m === DocumentMode.BITMAP) {
            alert("Convert to RGB or Grayscale first."); throw new Error("Unsupported mode");
        }
    }
    function hasPixels(L){
        try{
            var b=L.bounds, w=b[2].as('px')-b[0].as('px'), h=b[3].as('px')-b[1].as('px');
            return (w>0 && h>0);
        }catch(e){ return false; }
    }
    function ensurePaintLayer(){
        var d=app.activeDocument;
        for (var i=0;i<d.layers.length;i++){
            var L=d.layers[i];
            if (L.typename==="ArtLayer" && L.name==="PAINT_HERE") return L;
        }
        var lay=d.artLayers.add(); lay.name="PAINT_HERE"; lay.kind=LayerKind.NORMAL; return lay;
    }
    function deleteGroupIfExists(name){
        var d=app.activeDocument;
        for (var i=0;i<d.layerSets.length;i++){
            if (d.layerSets[i].name===name){ d.layerSets[i].remove(); return; }
        }
    }
    function newGroupAbove(ref,name){
        var g=app.activeDocument.layerSets.add(); g.name=name; g.move(ref,ElementPlacement.PLACEAFTER); return g;
    }

    // ======= GUIDES & DEBUG =======
    function addCenterGuides(){
        var d=app.activeDocument, prev=app.preferences.rulerUnits; app.preferences.rulerUnits=Units.PIXELS;
        try{
            var cx=d.width.as('px')/2, cy=d.height.as('px')/2;
            try{ d.guides.add(Direction.VERTICAL,   UnitValue(cx,'px')); }catch(e){}
            try{ d.guides.add(Direction.HORIZONTAL, UnitValue(cy,'px')); }catch(e){}
        } finally { app.preferences.rulerUnits=prev; }
    }
    function addDebugOverlay(){
        if (!DEBUG) return;
        var d=app.activeDocument;
        try { d.layerSets.getByName("__DEBUG__").remove(); } catch(e){}
        var g = d.layerSets.add(); g.name = "__DEBUG__";

        var prev = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;
        try {
            var cx = d.width.as('px')/2, cy = d.height.as('px')/2;

            // 1) crosshair (thin)
            var cross = d.artLayers.add(); cross.name = "center_cross"; cross.kind = LayerKind.NORMAL; cross.move(g, ElementPlacement.INSIDE);
            d.activeLayer = cross;

            // tiny 3x3 cross
            var col = new SolidColor(); col.rgb.red=255; col.rgb.green=0; col.rgb.blue=0;
            d.selection.select([[cx-1,cy],[cx+2,cy],[cx+2,cy+1],[cx-1,cy+1]]);
            d.selection.fill(col); d.selection.deselect();
            d.selection.select([[cx,cy-1],[cx+1,cy-1],[cx+1,cy+2],[cx,cy+2]]);
            d.selection.fill(col); d.selection.deselect();

            // 2) ring path (to see concentric rotation visually)
            var ring =  Math.min(d.width.as('px'), d.height.as('px')) * 0.25;
            var pathName = "pivot_ring";
            try { d.pathItems.getByName(pathName).remove(); } catch(e){}
            var spi = new SubPathInfo(); spi.closed = true; spi.operation = ShapeOperation.SHAPEXOR;
            function makePoint(x,y){ var p=new PathPointInfo(); p.kind=PointKind.CORNERPOINT; p.anchor=[x,y]; p.leftDirection=[x,y]; p.rightDirection=[x,y]; return p; }
            // rough 12-gon ring (good enough for viz)
            var pts = [];
            for (var k=0;k<12;k++){
                var th = 2*Math.PI*k/12;
                var x = cx + ring*Math.cos(th);
                var y = cy - ring*Math.sin(th);
                pts.push(makePoint(x,y));
            }
            spi.entireSubPath = pts;
            d.pathItems.add(pathName,[spi]);
        } finally {
            app.preferences.rulerUnits = prev;
        }
        g.opacity = 60; // faint
    }

    // ======= SELECTION (fixed left-upper wedge 180°->135°) =======
    function selectLeftUpperWedge(){
        var d=app.activeDocument, prev=app.preferences.rulerUnits; app.preferences.rulerUnits=Units.PIXELS;
        try{
            var w=d.width.as('px'), h=d.height.as('px'), cx=w/2, cy=h/2, R=Math.sqrt(w*w+h*h)*2;
            function pt(deg){ var rad=deg*Math.PI/180; return [cx + R*Math.cos(rad), cy - R*Math.sin(rad)]; }
            var p180=pt(180), p135=pt(135);
            d.selection.select([[cx,cy], p180, p135], SelectionType.REPLACE, 0, true);
        } finally { app.preferences.rulerUnits=prev; }
    }
    function clearOutsideSelection(){
        var d=app.activeDocument;
        d.selection.invert(); d.selection.clear(); d.selection.deselect();
    }

    // ======= EXACT DOC-CENTER ROTATION (Free Transform with Cntr) =======
    /**
     * Rotate a layer around the document centre by the given angle.
     * Avoids error 8800 by skipping empty layers and deselecting before transform.
     */
    function rotateLayerAboutDocCenter(layer, degrees) {
        if (!hasPixels(layer)) return;               // skip if no pixels – prevents error 8800

        var d = app.activeDocument;
        d.selection.deselect();                      // selections can interfere with transforms
        d.activeLayer = layer;

        // Document centre in pixels
        var cx = d.width.as('px') / 2;
        var cy = d.height.as('px') / 2;

        var idTrnf = charIDToTypeID("Trnf");         // free transform event
        var desc  = new ActionDescriptor();

        // Target the current layer
        var ref   = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        // Make the transform centre independent of the layer bounds (QCsi)
        desc.putEnumerated(charIDToTypeID("FTcs"),
                           charIDToTypeID("QCSt"),
                           charIDToTypeID("Qcsi"));

        // Set the position of the reference point (pivot) to the document centre
        var positionDesc = new ActionDescriptor();
        positionDesc.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), cx);
        positionDesc.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), cy);
        desc.putObject(charIDToTypeID("Pstn"), charIDToTypeID("Pnt "), positionDesc);

        // Provide a zero offset (mandatory when using FTcs/Qcsi)
        var offsetDesc = new ActionDescriptor();
        offsetDesc.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0.0);
        offsetDesc.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0.0);
        desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), offsetDesc);

        // Finally, set the rotation angle
        desc.putUnitDouble(charIDToTypeID("Angl"), charIDToTypeID("#Ang"), degrees);

        // Perform the transform
        executeAction(idTrnf, desc, DialogModes.NO);
    }


    // ======= MAIN BUILD =======
    function run(){
        assertDoc();
        addCenterGuides();
        addDebugOverlay();

        var d = app.activeDocument;
        var base = ensurePaintLayer();

        // Enforce drawing only in the allowed wedge (so the source is unambiguous)
        d.activeLayer = base;
        selectLeftUpperWedge();
        clearOutsideSelection();

        if (!hasPixels(base)){
            deleteGroupIfExists("Mirrors_8");
            alert("Nothing in the left-upper wedge on 'PAINT_HERE'. Draw there, then run again.");
            return;
        }

        deleteGroupIfExists("Mirrors_8");
        var grp = newGroupAbove(base, "Mirrors_8");

        // Duplicate wedge 8× and rotate around the EXACT doc center
        for (var k=0;k<8;k++){
            var dup = base.duplicate(); dup.name = "Sector_" + k;
            dup.move(grp, ElementPlacement.INSIDE);
            rotateLayerAboutDocCenter(dup, 45*k); // 0,45,…,315
        }

        alert("Mirrors updated. The red cross/ring is the exact pivot. Hide __DEBUG__ when not needed.");
    }

    app.activeDocument.suspendHistory("Radial-8 (fixed wedge, doc-center, debug)", "run()");
})();
