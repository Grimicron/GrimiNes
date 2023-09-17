let show_logs = true;

// Returns the 8-bit signed two's complement of the given number
function twos_comp(n){
    return (0x100 - n) & 0xFF;
}

// Return the 8-bit signed one's complement of the given number
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
