// These are initialized when the DOM has finished loading
let rom_input      = null;
let rom_button     = null;
let reset_button   = null;
let q_save_button  = null;
let q_load_button  = null;
let f_save_button  = null;
let load_input     = null;
let f_load_button  = null;
let reload_button  = null;
let quit_button    = null;
let overlay_button = null;
let notification   = null;
let fps_counter    = null;
let canvas         = null;
let fr             = null;
let my_nes         = null;
let bt_overlay     = null;
let last_save      = null;
let nes_inited     = false;

// The NES automically handles the possibility of there being timing irregularities
// in how often this function is called, so we can use the much less CPU intensive
// requestAnimationFrame instead of setInterval
function frame(){
    my_nes.emu_cycle_queue();
    window.requestAnimationFrame(frame);
}

function init_nes(rom){
    // Hide overflow to make game as visible at all times as possible and
    // to prevent the user form accidentally scrolling away just in case
    // This is the only way to set the property as important
    document.body.setAttribute("style", "overflow-y: hidden !important;");
    document.getElementById("game-container").style.overflowY = "hidden";
    // Show/hide all the approtiate elements
    canvas.style.display = "block";
    document.querySelectorAll("#actions-container button").forEach((b) => {
       b.style.display = "block"; 
    });
    rom_button.style.display = "none";
    document.getElementById("quick-rom-select-container").style.display = "none";
    document.getElementById("main-title").style.display = "none";
    fps_counter.style.display = "block";
    bt_overlay.style.display = "block";
    // Actually initialize the NES with the ROM and canvas context (it takes
    // care itself of the audio output)
    my_nes.init(canvas, rom, "fps-counter");
    // We could allow the user to redefine the binds in the future, but we can
    // just hardcode them in for now
    my_nes.set_controller_binds({
        a:      "KeyX"      ,
        b:      "KeyZ"      ,
        select: "Space"     ,
        start:  "Enter"     ,
        up:     "ArrowUp"   ,
        down:   "ArrowDown" ,
        left:   "ArrowLeft" ,
        right:  "ArrowRight",
    },{
        a:       1,
        b:       0,
        select:  8,
        start:   9,
        up:     12,
        down:   13,
        left:   14,
        right:  15,
    }, "tactile-overlay");
    // The NES automatically starts off as paused
    my_nes.paused = false;
    window.requestAnimationFrame(frame);
    // Undo transparency transition
    document.getElementById("game-container").classList.toggle("transitioning");
    // Transparency transition for the tactile overlay
    bt_overlay.classList.add("ingame");
}

function deinit_nes(){
    // Allow the NES to be initialized again
    nes_inited = false;
    // Basically do the opposite that we did in init, by showing the overflow
    // and showing/hiding the opposite elements
    document.body.setAttribute("style", "overflow-y: auto !important;");
    document.getElementById("game-container").style.overflowY = "auto";
    canvas.style.display = "none";
    document.querySelectorAll("#actions-container button").forEach((b) => {
       b.style.display = "none"; 
    });
    rom_button.style.display = "block";
    document.getElementById("quick-rom-select-container").style.display = "grid";
    document.getElementById("main-title").style.display = "block";
    fps_counter.style.display = "none";
    // Prepares the NES to be collected by the garbage collector and not leave
    // any persistent objects/processes/listeners
    my_nes.destroy();
    // Actually destroy the NES and replace it with a blank one
    my_nes = new NES();
    // Loading the save of one game into a completely different game would be
    // pretty weird and buggy, but it does produce some interesting visual
    // effects if you try it by tinkering around
    last_save = null;
    // Undo transparency transition
    document.getElementById("game-container").classList.toggle("transitioning");
}

function quick_load(name){
    // This type of request is as far as my knowledge goes the best way to communicate
    // with our server-side ROM library as far as my knowledge goes
    let req = new XMLHttpRequest();
    req.open("GET", "roms/" + name, true);
    req.responseType = "arraybuffer";
    req.overrideMimeType("text/plain");
    req.onload = () => {
        if (req.status != 200) return;
        // If the user double clicked the quick load button, init_nes may be
        // triggered twice, which can corrupt the state of the NES, so we prevent
        // that with this check
        if (nes_inited) return;
        nes_inited = true;
        // Transparency transition which takes .5 seconds
        document.getElementById("game-container").classList.toggle("transitioning");
        setTimeout(() => {
            init_nes(new Uint8Array(req.response));
            // Setting tthe overflow properties of the DOM to hidden still requires
            // the user to scroll up in order to actually hide the overflow, so
            // we do that for them here
            window.scrollTo(0, 0);
        }, 500);
    };
    req.send();
}

function try_uri_load(){
    let rom_name = window.location.search.split("?")[1];
    if (!rom_name) return;
    if (!rom_name.endsWith(".nes")) rom_name += ".nes";
    quick_load(rom_name);
}

// Injects the ROM icons and hooks up the on click
// event listener for each ROM in the quick select menu
function inject_rom_list_info(){
    // We can basically reuse the same element for each ROM
    let icon = document.createElement("img");
    // Show nothing if icon doesn't exist
    icon.alt = "";
    document.querySelectorAll("#quick-rom-select-container li").forEach((e) => {
        e.addEventListener("click", () => {
            quick_load(e.getAttribute("rom") + ".nes");
        });
        icon.src = "img/icons/" + e.getAttribute("rom") + ".png";
        // We clone the icon because it doesn't allow us to append the actual
        // element twice
        e.prepend(icon.cloneNode(true));
        e.append(icon.cloneNode(true));
    });
}

function notify(text){
    // Sets the text of the notification bar and fades it in and out
    // for a short moment to alert the user about any errors, or confirm
    // to them that an action they performed did go through
    notification.innerHTML = text;
    notification.classList.add("showing");
    setTimeout(() => {
        notification.classList.remove("showing");
    }, 500);
}

document.addEventListener("DOMContentLoaded", () => {
    // Lots of element getting to later do stuff with them
    bt_overlay     = document.getElementById("tactile-overlay");
    rom_input      = document.getElementById("rom-input");
    rom_button     = document.getElementById("rom-button");
    reset_button   = document.getElementById("reset-button");
    q_save_button  = document.getElementById("q-save-button");
    q_load_button  = document.getElementById("q-load-button");
    f_save_button  = document.getElementById("f-save-button");
    f_load_button  = document.getElementById("f-load-button");
    load_input     = document.getElementById("load-input");
    reload_button  = document.getElementById("reload-button");
    quit_button    = document.getElementById("quit-button");
    overlay_button = document.getElementById("overlay-button");
    notification   = document.getElementById("notification-container");
    fps_counter    = document.getElementById("fps-counter");
    canvas         = document.getElementById("screen");
    fr             = new FileReader();
    my_nes         = new NES();
    // Some browsers make 100vh not actually equal to the amount of vertical space
    // we have available, so we have to get that information ourselves and pass it
    // on to the stylesheet
    document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
    window.addEventListener("resize", () => {
        document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
    });
    // For quicker access to a certain game, you can type in:
    // https://whatever.url.here.com/?myfavgame
    // and it will load automatically for you (if it's in the ROM library)
    // Also, you can add the .nes prefix if you want to be really pedantic like so:
    // https://whatever.url.here.com/?myfavgame.nes
    try_uri_load();
    inject_rom_list_info();
    // Wait a tiny bit to show the content to make sure everything
    // is pretty much loaded
    setTimeout(() => {
        document.getElementById("game-container").classList.toggle("transitioning");
    }, 500);
    // Action button bindings
    // There's not really much to say about these, the code pretty much
    // speaks for itself
    rom_input.onchange = (e) => {
	    fr.readAsArrayBuffer(rom_input.files[0]);
        fr.onloadend = (e) => {
            if (nes_inited) return;
            nes_inited = true;
            document.getElementById("game-container").classList.toggle("transitioning");
            setTimeout(() => {
                init_nes(new Uint8Array(fr.result));
                window.scrollTo(0, 0);
            }, 500);
        };
        prev_default(e);
    };
    rom_button.onclick = (e) => {
        rom_input.click();
        prev_default(e);
    };
    reset_button.onclick = (e) => {
        my_nes.reset();
        prev_default(e);
    };
    q_save_button.onclick = (e) => {
        try{
            last_save = my_nes.to_json();
            notify("QUICK SAVE SUCCESSFUL");
        }
        catch(e){
            notify("QUICK SAVE UNSUCCESSFUL: " + e.toString().toUpperCase());
        }
        prev_default(e);
    };
    q_load_button.onclick = (e) => { 
        try{
            if (last_save == null){
                notify("QUICK LOAD UNSUCCESSFUL: LOCAL SAVE IS NOT DEFINED YET");
                return;
            }
            my_nes.from_json(last_save);
            notify("QUICK LOAD SUCCESSFUL");
        }
        catch(e){
            notify("QUICK LOAD UNSUCCESSFUL: " + e.toString().toUpperCase());
        }
        prev_default(e);
    };
    f_save_button.onclick = (e) => {
        try{
            last_save = my_nes.to_json();
            download("grimines_save.state", [JSON.stringify(last_save)]);
            notify("FILE SAVE SUCCESSFUL");
        }
        catch(e){
            notify("FILE SAVE UNSUCCESSFUL: " + e.toString().toUpperCase());
        }
        prev_default(e);
    };
    f_load_button.onclick = (e) => {
        load_input.click();
        prev_default(e);
    };
    load_input.onchange = (e) => {
        try{
            fr.readAsText(load_input.files[0]);
            fr.onloadend = (e) => {
                last_save = JSON.parse(fr.result);
                my_nes.from_json(last_save);
            };
            notify("FILE LOAD SUCCESSFUL");
        }
        catch(e){
            notify("FILE LOAD UNSUCCESSFUL: " + e.toString().toUpperCase());
        }
        prev_default(e);
    };
    // Adds a couple of keyboard shortcuts for quick saving (E) and loading (R),
    // which is really useful for grinding a challenge (boss, platforming, etc...)
    // and you don't want to take your hands all the way to the mouse to click the
    // quick load button
    document.addEventListener("keydown", (e) => {
        if      (e.code == "KeyE"){
            try{
                last_save = my_nes.to_json();
                notify("QUICK SAVE SUCCESSFUL");
            }
            catch(e){
                notify("QUICK SAVE UNSUCCESSFUL: " + e.toString().toUpperCase());
            }
            prev_default(e);
        }
        else if (e.code == "KeyR"){
            try{
                if (last_save == null){
                    notify("QUICK LOAD UNSUCCESSFUL: LOCAL SAVE IS NOT DEFINED YET");
                    return;
                }
                my_nes.from_json(last_save);
                notify("QUICK LOAD SUCCESSFUL");
            }
            catch(e){
                notify("QUICK LOAD UNSUCCESSFUL: " + e.toString().toUpperCase());
            }
            prev_default(e);
        }
    });
    quit_button.onclick = (e) => {
        // Some things are out of order compared to init_nes's control flow
        // but that's just because of transition timings
        document.getElementById("game-container").classList.toggle("transitioning");
        bt_overlay.classList.remove("ingame");
        setTimeout(() => {
            bt_overlay.style.display = "none";
            deinit_nes();
            window.scrollTo(0, 0);
        }, 500);
        prev_default(e);
    };
    // Repurposes the transition when exiting and entering a game for hiding
    // and reshowing the overlay
    overlay_button.onclick = (e) => {
        bt_overlay.classList.toggle("ingame");
        setTimeout(() => {
            // Toggle the display attribute  none <==> block
            bt_overlay.style.display = (bt_overlay.display == "none") ? "block" : "none";
        }, 500);
        prev_default(e);
    };
});

// Kind of weird for this very technical function to be here, but it's a very
// useful piece of debug code to run in the console and it doesn't really have
// another place to be
// For more info about why it works, check ppu.js, it has lots of links to useful
// docs and the code is well-commented
function dump_pattern_table(offset, rom_reference){
    let palette = [
        "#000000",
        "#FF0000",
        "#00FF00",
        "#0000FF",
    ];
    for (let i = 0; i < 0x100; i++){
        let low_bytes = [];
        let high_bytes = [];
        for (let j = 0; j < 8; j++){
            low_bytes[j]  = rom_reference[(i*16) + j + 0 + offset];
            high_bytes[j] = rom_reference[(i*16) + j + 8 + offset];
        }
        for (let j = 0; j < 64; j++){
            let px_x  = (j & 0x07) >>> 0;
            let px_y  = (j & 0x38) >>> 3;
            let pos_x = (((i & 0x0F) >>> 0)*8) + px_x;
            let pos_y = (((i & 0xF0) >>> 4)*8) + px_y;
            let high_bit = !!(high_bytes[px_y] & (0x80>>>px_x));
            let low_bit  = !!(low_bytes [px_y] & (0x80>>>px_x));
            let color = palette[(high_bit<<1) | (low_bit<<0)];
            ctx.fillStyle = color;
            ctx.fillRect(pos_x + ((offset & 0x1FFF)>>>5), pos_y, 1, 1);
        }
    }
}

function dump_pattern_tables(offset, rom_type){
    // As long as these reads are from the PRG_ROM or CHR ROM/RAM,
    // it shouldn't affect any MMC IRQs, meaning it shouldn't modify
    // the internal state of the NES
    let rom_reference = (rom_type.toLowerCase() == "PRG")
                       ? my_nes.mmap.mapper.prg_rom
                       : my_nes.mmap.mapper.chr_rom;
    dump_pattern_table(offset + 0x0000, rom_reference);
    dump_pattern_table(offset + 0x1000, rom_reference);
}
