let rom_input     = null;
let rom_button    = null;
let reset_button  = null;
let q_save_button = null;
let q_load_button = null;
let f_save_button = null;
let load_input    = null;
let f_load_button = null;
let reload_button = null;
let quit_button   = null;
let canvas        = null;
let ctx           = null;
let fr            = null;
let my_nes        = null;
let bt_overlay    = null;
let last_save     = null;

function dump_pattern_table(offset){
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
            low_bytes[j]  = my_nes.mmap.mapper.prg_rom[(i*16) + j + 0 + offset];
            high_bytes[j] = my_nes.mmap.mapper.prg_rom[(i*16) + j + 8 + offset];
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

function dump_pattern_tables(offset){
    dump_pattern_table(offset + 0x0000);
    dump_pattern_table(offset + 0x1000);
}

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
    canvas.style.display = "block";
    document.querySelectorAll("#actions-container button").forEach((b) => {
       b.style.display = "block"; 
    });
    rom_button.style.display = "none";
    document.getElementById("quick-rom-select-container").style.display = "none";
    document.getElementById("main-title").style.display = "none";
    my_nes.init(ctx, rom);
    my_nes.paused = false;
    window.requestAnimationFrame(frame);
    // Undo transparency transition
    document.getElementById("game-container").classList.toggle("transitioning");
    bt_overlay.style.display = "block";
    bt_overlay.classList.add("ingame");
}

function deinit_nes(){
    document.body.setAttribute("style", "overflow-y: auto !important;");
    document.getElementById("game-container").style.overflowY = "auto";
    canvas.style.display = "none";
    document.querySelectorAll("#actions-container button").forEach((b) => {
       b.style.display = "none"; 
    });
    rom_button.style.display = "block";
    document.getElementById("quick-rom-select-container").style.display = "grid";
    document.getElementById("main-title").style.display = "block";
    // Prepares the NES to be collected by the garbage collector and not leave
    // any persistent objects/processes
    my_nes.destroy();
    my_nes = new NES();
    document.getElementById("game-container").classList.toggle("transitioning");
}

function quick_load(name){
    let req = new XMLHttpRequest();
    req.open("GET", "roms/" + name, true);
    req.responseType = "arraybuffer";
    req.overrideMimeType("text/plain");
    req.onload = () => {
        if (req.status != 200) return;
        // Transparency transition which takes .5 seconds
        document.getElementById("game-container").classList.toggle("transitioning");
        setTimeout(() => {
            init_nes(new Uint8Array(req.response));
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
        e.prepend(icon.cloneNode(true));
        e.append(icon.cloneNode(true));
    });
}

document.addEventListener("DOMContentLoaded", () => {
    bt_overlay    = document.getElementById("tactile-overlay");
    rom_input     = document.getElementById("rom-input");
    rom_button    = document.getElementById("rom-button");
    reset_button  = document.getElementById("reset-button");
    q_save_button = document.getElementById("q-save-button");
    q_load_button = document.getElementById("q-load-button");
    f_save_button = document.getElementById("f-save-button");
    f_load_button = document.getElementById("f-load-button");
    load_input    = document.getElementById("load-input");
    reload_button = document.getElementById("reload-button");
    quit_button   = document.getElementById("quit-button");
    canvas        = document.getElementById("screen");
    ctx           = canvas.getContext("2d");
    fr            = new FileReader();
    my_nes        = new NES();
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
    window.addEventListener("resize", () => {
        document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
    });

    try_uri_load();
    inject_rom_list_info();
    // Wait a tiny bit to show the content to make sure everything
    // is pretty much loaded
    setTimeout(() => {
        document.getElementById("game-container").classList.toggle("transitioning");
    }, 500);
    rom_input.onchange = () => {
	    fr.readAsArrayBuffer(rom_input.files[0]);
        fr.onloadend = (e) => {
            document.getElementById("game-container").classList.toggle("transitioning");
            setTimeout(() => {
                init_nes(new Uint8Array(fr.result));
                window.scrollTo(0, 0);
            }, 500);
        };
    };
    rom_button.onclick = () => {
        rom_input.click();
    };
    reset_button.onclick = () => {
        my_nes.reset();
        dump_pattern_tables(0x0000);
    };
    q_save_button.onclick = () => {
        last_save = my_nes.to_json();
    };
    q_load_button.onclick = () => {
        my_nes.from_json(last_save);
    };
    f_save_button.onclick = () => {
        last_save = my_nes.to_json();
        download("grimines_save.state", [JSON.stringify(last_save)]);
    };
    f_load_button.onclick = () => {
        load_input.click();
    };
    load_input.onchange = () => {
        fr.readAsText(load_input.files[0]);
        fr.onloadend = (e) => {
            last_save = JSON.parse(fr.result);
            my_nes.from_json(last_save);
        };
    };
    document.addEventListener("keydown", (e) => {
        if     ((e.code == "KeyR") && (last_save != null)) my_nes.from_json(last_save);
        else if (e.code == "KeyE"){
            last_save = my_nes.to_json();
        }
    });
    quit_button.onclick = () => {
        document.getElementById("game-container").classList.toggle("transitioning");
        bt_overlay.classList.remove("ingame");
        setTimeout(() => {
            bt_overlay.style.display = "none";
            deinit_nes();
            window.scrollTo(0, 0);
        }, 500);
    };
});
