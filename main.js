let rom_input    = null;
let rom_button   = null;
let reset_button = null;
let save_button  = null;
let load_button  = null;
let load_input   = null;
let canvas       = null;
let ctx          = null;
let fr           = null;
let my_nes       = null;
let bt_overlay   = null;

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
    // Only activate overlay if the device has touch features
    if(window.matchMedia("(pointer: coarse)").matches) bt_overlay.style.display = "block";
    canvas.style.display        = "block";
    reset_button.style.display  = "block";
    save_button.style.display   = "block";
    load_button.style.display   = "block";
    rom_button.style.display    = "none";
    document.querySelectorAll(".quick-rom-select").forEach((e) => { e.style.display = "none"; });
    my_nes.init(ctx, rom);
    window.requestAnimationFrame(frame);
}

function quick_load(name){
    let req = new XMLHttpRequest();
    req.open("GET", "roms/" + name, true);
    req.responseType = "arraybuffer";
    req.overrideMimeType("text/plain");
    req.onload = () => {
        if (req.status != 200) return;
        init_nes(new Uint8Array(req.response));
    };
    req.send();
}

function try_uri_load(){
    let rom_name = window.location.search.split("?")[1];
    if (!rom_name) return;
    if (!rom_name.endsWith(".nes")) rom_name += ".nes";
    quick_load(rom_name);
}

document.addEventListener("DOMContentLoaded", () => {
    bt_overlay   = document.getElementById("tactile-overlay");
    rom_input    = document.getElementById("rom-input");
    rom_button   = document.getElementById("rom-button");
    reset_button = document.getElementById("reset-button");
    save_button  = document.getElementById("save-button");
    load_button  = document.getElementById("load-button");
    load_input   = document.getElementById("load-input");
    canvas       = document.getElementById("screen");
    ctx          = canvas.getContext("2d");
    fr           = new FileReader();
    my_nes       = new NES();
    
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;

    try_uri_load();
    
    rom_input.onchange = () => {
	    fr.readAsArrayBuffer(rom_input.files[0]);
        fr.onloadend = (e) => {
            init_nes(new Uint8Array(fr.result));
        };
    };
    rom_button.onclick = () => {
        rom_input.click();
    };
    reset_button.onclick = () => {
        my_nes.reset();
    };
    save_button.onclick = () => {
        download("grimines_save.state", [JSON.stringify(my_nes.to_json())]);
    };
    load_button.onclick = () => {
        load_input.click();
    };
    load_input.onchange = () => {
        fr.readAsText(load_input.files[0]);
        fr.onloadend = (e) => {
            my_nes.from_json(JSON.parse(fr.result));
        };
    };
});
