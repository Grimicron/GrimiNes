let rom_input = document.getElementById("rom-input");
let canvas    = document.getElementById("screen");
let ctx       = canvas.getContext("2d");
let fr        = new FileReader();
let test_nes  = new NES(ctx);
fr.onloadend  = (e) => {
    rom_input.style.display = "none";
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    test_nes.init(new Uint8Array(fr.result));
    window.setInterval(() => {
        test_nes.emu_cycle();
    }, 1000 / 1_790_000);
    //dump_pattern_tables();
};
rom_input.onchange = () => {
	fr.readAsArrayBuffer(rom_input.files[0]);
};

function dump_pattern_table(offset){
    let palette = [
        "#000000",
        "#FF0000",
        "#00FF00",
        "#0000FF",
    ];
    // Left pattern table
    for (let i = 0; i < 0x100; i++){
        let low_bytes = [];
        let high_bytes = [];
        for (let j = 0; j < 8; j++){
            low_bytes[j]  = test_nes.mmap.ppu_get_byte(i*16 + j + 0 + offset);
            high_bytes[j] = test_nes.mmap.ppu_get_byte(i*16 + j + 8 + offset);
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
            ctx.fillRect(pos_x + (offset>>>5), pos_y, 1, 1);
        }
    }
}

function dump_pattern_tables(){
    dump_pattern_table(0x0000);
    dump_pattern_table(0x1000);
}

