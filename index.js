let rom_input = document.getElementById("rom-input");
let fr = new FileReader();
fr.onloadend = (e) => {
	console.log(fr.result);
};
rom_input.onchange = () => {
	fr.readAsBinaryString(rom_input.files[0]);
};

