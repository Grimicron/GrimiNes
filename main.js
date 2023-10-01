let rom_input  = null;
let rom_button = null;
let canvas     = null;
let ctx        = null;
let fr         = null;
let my_nes     = null;

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
    canvas.style.display = "block";
    rom_button.style.display = "none";
    my_nes.init(ctx, rom);
    window.requestAnimationFrame(frame);
}

function try_uri_load(){
    let rom_name = window.location.search.split("?")[1];
    if (!rom_name) return;
    let req = new XMLHttpRequest();
    req.open("GET", "roms/" + rom_name, true);
    req.responseType = "arraybuffer";
    req.overrideMimeType("text/plain");
    req.onload = () => {
        if (req.status != 200) return;
        init_nes(new Uint8Array(req.response));
    };
    req.send();
}

document.addEventListener("DOMContentLoaded", () => {
    rom_input  = document.getElementById("rom-input");
    rom_button = document.getElementById("rom-button");
    canvas     = document.getElementById("screen");
    ctx        = canvas.getContext("2d");
    fr         = new FileReader();
    my_nes     = new NES();
    
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;

    try_uri_load();
    
    rom_input.onchange = () => {
	   fr.readAsArrayBuffer(rom_input.files[0]);
    };
    fr.onloadend = (e) => {
        init_nes(new Uint8Array(fr.result));
    };
    rom_button.onclick = () => {
        rom_input.click();
    };
});
