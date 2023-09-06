let show_logs = true;

function debug_log(obj){
    if (show_logs) console.log(obj);
}

function hx_fmt(num, double=false, prefix=false){
    return  (prefix ? "0x" : "")
         + ((num == null) ? "NN" : num.toString(16).padStart("0", double ? 4 : 2).toUpperCase());
}

