let rom_input = document.getElementById("rom-input");
let fr = new FileReader();
let test_cpu = new CPU();
fr.onloadend = (e) => {
    MMAP.init();
    MMAP.load_rom(new Uint8Array(fr.result));
    window.setInterval(() => {
        test_cpu.exec_op();
    }, 1000 / 1790);
};
rom_input.onchange = () => {
	fr.readAsArrayBuffer(rom_input.files[0]);
};

