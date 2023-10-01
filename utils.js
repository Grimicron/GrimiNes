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
    let element = document.createElement("a");
    let file = new Blob(data, { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
