let show_logs = true;

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

function download(filename, text) {
    let el = document.createElement('a');
    el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    el.setAttribute('download', filename);

    el.style.display = 'none';
    document.body.appendChild(el);

    el.click();

    document.body.removeChild(el);
}
