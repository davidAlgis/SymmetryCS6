/**
 * AutoSaveSingle.jsx — Photoshop CS6 autosave (overwrite one backup file)
 *
 * Behavior
 *  - Every N minutes, saves a PSD COPY of the *active document* to:
 *      <Temp>/PS_Autosaves/<DocName>/<DocName>_autosave.psd
 *  - Always overwrites that same file (no multiple backups).
 *  - Does NOT change your working file/path (uses saveAs(..., asCopy=true)).
 *
 * How to use
 *  - File -> Scripts -> Browse… -> select this .jsx to START autosaving.
 *  - To STOP (without closing Photoshop): in ExtendScript Toolkit, run: PS_RA_stop();
 */

#target photoshop

(function () {
    // ============================ CONFIG ============================
    var INTERVAL_MINUTES = 5;            // autosave frequency
    var ROOT_TEMP_NAME   = "PS_Autosaves";
    var SUFFIX           = "_autosave";  // backup filename suffix
    // ===============================================================

    // Expose to global so scheduleTask can call them
    var G = $.global;

    function sanitize(name) {
        return name.replace(/[\\\/:\*\?"<>\|]/g, "_");
    }

    function getDocBaseName(doc) {
        var n = (doc && doc.name) ? doc.name : "Untitled";
        var i = n.lastIndexOf(".");
        return (i > 0) ? n.substring(0, i) : n;
    }

    function getRootFolder() {
        var root = Folder(Folder.temp.fsName + "/" + ROOT_TEMP_NAME);
        if (!root.exists) { root.create(); }
        return root;
    }

    function ensureDocFolder(docBase) {
        var folder = Folder(getRootFolder().fsName + "/" + sanitize(docBase));
        if (!folder.exists) { folder.create(); }
        return folder;
    }

    function backupFileFor(docBase) {
        var folder = ensureDocFolder(docBase);
        var fname  = sanitize(docBase) + SUFFIX + ".psd";
        return File(folder.fsName + "/" + fname);
    }

    function savePsdCopy(doc, fileObj) {
        var opts = new PhotoshopSaveOptions();
        opts.embedColorProfile = true;
        opts.maximizeCompatibility = true;
        // Save as copy so the working document/path is untouched
        doc.saveAs(fileObj, opts, true /*asCopy*/, Extension.LOWERCASE);
    }

    // =============== SCHEDULER (single-file overwrite) ===============
    G.PS_RA_doAutoSaveSingle = function () {
        try {
            if (app.documents.length > 0) {
                var doc    = app.activeDocument;
                var base   = getDocBaseName(doc);
                var target = backupFileFor(base);
                try {
                    savePsdCopy(doc, target);
                    $.writeln("[Autosave] Wrote: " + target.fsName);
                } catch (eSave) {
                    $.writeln("[Autosave] Save failed: " + eSave);
                }
            }
        } catch (e) {
            $.writeln("[Autosave] Error: " + e);
        }

        // Schedule next run
        app.scheduleTask("PS_RA_doAutoSaveSingle()", INTERVAL_MINUTES * 60, false);
    };

    // Optional stop function
    G.PS_RA_stop = function () {
        try { app.cancelTask("PS_RA_doAutoSaveSingle()"); } catch (e) {}
        $.writeln("[Autosave] Stopped.");
    };

    // Prevent duplicate schedulers if run twice
    try { app.cancelTask("PS_RA_doAutoSaveSingle()"); } catch (e) {}

    // Kick off immediately
    G.PS_RA_doAutoSaveSingle();
})();
