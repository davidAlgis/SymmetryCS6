# Radial Symmetry Tool

This Photoshop CS6 script lets you draw in a single wedge of the canvas and automatically replicate your strokes across **8 radial sectors**. It has been made to replicate the behavior of [procreate](https://help.procreate.com/procreate/handbook/guides/guides-symmetry). 

# How to run it

1. Open your document in Photoshop CS6.  
2. Go to **File → Scripts → Browse…** and select the `symmetry.jsx` file.  
3. Draw only inside the highlighted wedge on the `PAINT_HERE` layer, then run the script again to update the symmetry.

### (Optional) Faster with Actions
- Press **Alt+F9** to open the **Actions panel**.  
- Create a new Action, start recording, then go to **File → Scripts → Browse…** and run the script once.  
- Stop recording and assign a Function Key (e.g. **F2**).  
- From now on, pressing your shortcut runs the script instantly.


# For auto backup :

In **CS6 portable** you don’t have the full Adobe installer structure, so there’s no guaranteed `Presets/Scripts` or `Startup Scripts` folder that Photoshop scans automatically. But you still have a few practical ways to make your autosave script run every time Photoshop starts:

---

## 1. Startup Scripts folder (if present in your build)

* Check inside your Photoshop CS6 portable folder for something like:

  ```
  Plug-ins/Scripts/Startup Scripts/
  ```

  or

  ```
  Presets/Scripts/Startup Scripts/
  ```
* If that exists, drop your `AutoSaveSingle.jsx` in there.
* Restart Photoshop → it will run automatically on launch.

👉 In portable builds this folder often isn’t there, so move to option 2.

---

## 2. Use an Action + Startup Shortcut

1. Open Photoshop, press **Alt+F9** to open the **Actions** panel.
2. Create a new Action → name it “Launch Autosave”.
3. Start recording, then go to **File → Scripts → Browse…**, pick your `AutoSaveSingle.jsx`, let it run once, then stop recording.
4. Save your action set (`.atn`) if you want portability.
5. In **Edit → Preferences → General**, check **Allow Script Events to Run**.
6. Then use **File → Scripts → Script Events Manager…**:

   * Enable “Allow Script Events to Run”.
   * Event: **Start Application**.
   * Action: select your “Launch Autosave” action.
7. Done → every time Photoshop starts, it triggers that Action, which launches your autosave script.

---

## 3. Script Events Manager directly (no Actions, simpler)

* Go to **File → Scripts → Script Events Manager…**
* Enable “Allow Script Events to Run”.
* Event: **Start Application**.
* Then choose **Browse…** and point directly to your `AutoSaveSingle.jsx`.
* Add → Done.
* Now your script will launch at Photoshop startup.

⚠️ This is the most portable-friendly solution, since it doesn’t depend on missing folders.

---

✅ **Recommendation for your CS6 portable:** Use **Script Events Manager → Start Application → Browse…** and select your script.
That way, it auto-runs at launch without needing a Presets/Scripts folder.

---

Do you want me to write the exact **step-by-step menu clicks in CS6 (with English and French menu names)** so you can set it up in your portable edition without confusion?
