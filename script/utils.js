let show_logs = false;

// Returns the 8-bit signed two's complement of the given number
function twos_comp(n){
    return (0x100 - n) & 0xFF;
}

// Returns the 8-bit signed one's complement of the given number
function ones_comp(n){
    return 0xFF - n;
}

function debug_log(obj){
    if (show_logs) console.log(obj);
}

function hx_fmt(num, double=false, prefix=false){
    return  (prefix ? "0x" : "")
          + ((num == null) ? "NN" : num.toString(16).padStart(double ? 4 : 2, "0").toUpperCase());
}

function bn_fmt(num, nibbles=4, prefix=false){
    return  (prefix ? "0b" : "")
          + ((num == null) ? "NN" : num.toString(2).padStart(nibbles * 4, "0"));
}

function download(filename, data){
    let e = document.createElement("a");
    let file = new Blob(data, { type: "text/plain" });
    e.href = URL.createObjectURL(file);
    e.download = filename;
    e.style.display = "none";
    document.body.appendChild(e);
    e.click();
    document.body.removeChild(e);
}

// A utility function to prevent the default event from happening
// in all listeners where it's desirable (e.g. the tactile overlay's listeners)
function prev_default(e){
    if (!e.cancelable) return;
    e.preventDefault();
    e.stopPropagation();
}
