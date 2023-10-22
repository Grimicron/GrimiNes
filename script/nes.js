class NES{
    static MASTER_CLOCK_HZ       = 21_477_270.0;
    static CPU_CLOCK_HZ          =  1_789_773.0;
    static PPU_CLOCK_HZ          =  5_369_318.0;
    static APU_CLOCK_HZ          =    894_887.0;
    // Represents the amount of master clock cycles
    // that one CPU cycle takes
    static CPU_CYC_PER_MASTER    = NES.CPU_CLOCK_HZ / NES.MASTER_CLOCK_HZ;
    // Same thing for the PPU
    static PPU_CYC_PER_MASTER    = NES.PPU_CLOCK_HZ / NES.MASTER_CLOCK_HZ;
    // Same thing for the APU
    static APU_CYC_PER_MASTER    = NES.APU_CLOCK_HZ / NES.MASTER_CLOCK_HZ;
    // To keep the NES running at a reasonable speed, we cap the amount
    // of cycles that we have to run in one chunk by adding a maximum
    // limit to the DT we use to determine the overdue cycles
    // When the device is not able to keep up with our computational
    // demands, the NES begins to look as if it were in slow motion
    // instead of being a choppy mess (though if the situation is
    // really bad, it will start to chop up)
    static MAX_OVERDUE_COMPUTING = 0.02;
    
    constructor(){
        this.cpu             = new CPU       (this);
        this.ppu             = new PPU       (this);
        this.apu             = new APU       (this);
        this.mmap            = new MMAP      (this);
        this.logger          = new LOGGER    (this);
        this.controller      = new CONTROLLER(this);
        this.paused          = true;
        // An object with various properties specifying miscellanious settings
        // we should follow, mostly about the quality and post-processing of our output
        this.settings        = {
            // If true, we will automatically start generating and downloading
            // the CPU logs created by logger.js
            keep_logs: false,
            audio:{
                // If false, it completely short circuits all APU calls in
                // the internal loop
                enabled           : true ,
                // Completely independent from apu_enabled, it can be 0 and we
                // will still emulate the APU
                volume            : 0.2  ,
                // Defines the sampling rate that the APU should produce, keep in
                // that for this to take effect, on the audio context, the entire NES
                // would have to be reinitialized
                sample_rate       : 44100,
                // Defines how often the APU should output buffers in Hz
                buffer_out_hz     : 10   ,
                // Indicates how the audio buffers the APU produces
                // should be mixed, ("none" = simple playback, silence
                // between buffers, "fade" = AudioFader post-processing,
                // explained in apu.js)
                buffer_mixing    : "fade",
                // Represents the length (in samples) of the fade-in of new audio buffers
                // that we receive from the APU
                // Only taken into account when buffer_mixing is set to fade
                fade_samples     : 200   ,
                // Represents the number of samples we keep replaying while we wait for new
                // samples to arrive, since replaying the whole buffer would sound very choppy,
                // unresponsive, and would increase audio popping
                // Has to be at least equal to or bigger than fade_samples to prevent any popping
                loop_keep_samples: 250   ,
            },
            video:{
                // Freezes the video and short-circuits all PPU logic in the
                // internal loop (for whatever reason anyone would want to do that)
                enabled       : true  ,
                // Defines by what factor we should increase the brightness for our video
                // output, useful when many retro effects are applied, as they cause a
                // drastic drop in brightness
                brightness    : 1.0   ,
                // Defines if retro effects should be applied to our video
                // output and of what quality they should be ("none" = raw video
                // output, "cheap" = darken every other scanline, "fancy" = full
                // post-processing, explained in ppu.js)
                retro_fx      : "none",
                // Defines if there should be spaces of lessened intensity between scanlines,
                // only taken into account when retro_fx is fancy
                scanline_pitch: false ,
                // Defines if there should be spaces of lessened intensity between pixels,
                // only taken into account when retro_fx is fancy
                pixel_pitch   : false ,
                // Defines if the edges of the screen should be slightly darkened or not,
                // only taken into account when retro_fx is fancy
                vignette      : false ,
                // Indicates if the video output should warp as if it was on an old
                // CRT display, only taken into account when retro_fx is fancy
                edge_warp     : false  ,
            },
        };
        this.prev_ts         = 0;
        this.fps_update_ts   = 0;
        // Counts how many full images have been rendered by the
        // PPU since we emulated the cycle queue
        this.frame_count     = 0;
        // The HTML element where we can display our FPS metric
        this.fps_display     = null;
        // The CPU returns how many cycles it should take to
        // complete an instruction, so we wait those out to
        // be somewhat cycle-accurate and keep the timings correct
        this.cpu_wait_cycles = 0;
        // Tracks how many PPU cycles we have left until we render the next scanline
        // We start it at 170 because it's more or less at the middle of a scanline,
        // and since our emulation is only scanline accurate, it should help us get slightly
        // more accurate results by possibly eliminating some errors that might come from
        // registers which are modified just after a scanline begins/ends
        this.ppu_wait_dots   = 170;
        // Represents how many cycles have been left over from the last time
        // we emulated the cycle queue, so we can more accurately emualte
        // the NES by not throwing away half/quarter/etc. of a cycle of
        // each component
        this.cpu_cycles_left = 0;
        this.ppu_cycles_left = 0;
        this.apu_cycles_left = 0;
        // A WebGLRenderingContext
        this.video_ctx       = null;
        // A BaseAudioContext (or its webkit variation)
        this.audio_ctx       = null;
    }

    to_json(){
        // Returns the current state of the NES for the purpose
        // of stringify-ing and saving
        // Doesn't contain the ROM data or current image buffer data
        // both because it's too big and because it should already be
        // loadedd in/will load in very soon
        return {
            version   : 3,
            cpu       : this.cpu.to_json(),
            ppu       : this.ppu.to_json(),
            apu       : this.apu.to_json(),
            mmap      : this.mmap.to_json(),
            controller: this.controller.to_json(),
            settings  : this.settings,
        };
    }

    from_json(state){
        // State should be the actual JSON object returned by
        // parsing the save state
        // .from_json() for every component of the NES is a 
        // function which modifies and initializes all the
        // internal variables to that of the data kept in the JSON,
        // it doesn't return a new CPU or whatever it may be
        this.cpu.from_json(state.cpu);
        this.ppu.from_json(state.ppu);
        // Version 1 and below didn't store any APU data, so we just
        // don't touch the APU
        if (state.version >= 2) this.apu.from_json(state.apu);
        this.mmap.from_json(state.mmap);
        this.controller.from_json(state.controller);
        // From version 3 onwards we implemented the settings property
        if (state.version >= 3) this.update_settings(state.settings);
    }
    
    init(p_canvas, rom, fps_display_id){
        this.video_ctx = p_canvas.getContext("2d");
        // We don't want any anti-aliasing done by the browser to our canvas,
        // we want to see the pixels perfectly distinct
        this.video_ctx.imageSmoothingEnabled    = false;
        this.video_ctx.mozImageSmoothingEnabled = false;
        this.audio_ctx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: this.settings.audio.sample_rate,
        });
        if (fps_display_id != null) this.fps_display = document.getElementById(fps_display_id);
        this.prev_ts = window.performance.now() / 1000;
        this.fps_update_ts = this.prev_ts;
        this.mmap.load_rom(rom);
        this.apu.init_sound();
        this.ppu.init_buffers();
        this.ppu.load_normal_palette();
        this.cpu.reset();
    }

    destroy(){
        // We only really need to destroy the audio pipeline, clear the canvas,
        // and unbind the controller listeners
        this.apu.destroy_sound();
        this.audio_ctx.close();
        this.video_ctx.clearRect(0, 0, 256, 240);
    }

    // Despite this being just a proxy function between the caller and the controller,
    // we want to keep the communication between the programmer and our internal components
    // ideally to zero by using these kinds of functions, so as to not expose all of our
    // internals, so that anyone can use this class
    set_controller_binds(p_kb_binds, p_gp_binds, p_bt_container){
        this.controller.set_binds(p_kb_binds, p_gp_binds, p_bt_container);
        this.controller.bind_kb();
        this.controller.bind_gp();
        this.controller.bind_bt();
    }

    update_settings(p_settings){
        // Only updates the settings that p_settings contains, so that
        // just 1 or 2 settings can be sent in to be changed and not worry
        // about the rest
        let entries = Object.entries(p_settings);
        for (let i = 0; i < entries.length; i++){
            // Since both video_fx and audio_fx are objects themselves,
            // we have to repeat the process of getting the entries
            // and setting only the defined ones
            if      (entries[i][0] == "video"){
                let video_entries = Object.entries(entries[i][1]);
                for (let j = 0; j < video_entries.length; j++){
                    if (this.settings.video.hasOwnProperty(video_entries[j][0])){
                        this.settings.video[video_entries[j][0]] = video_entries[j][1];
                    }
                }
            }
            else if (entries[i][0] == "audio"){
                let audio_entries = Object.entries(entries[i][1]);
                // Same as above, we have to repeat the process of getting the entries
                // and setting only the defined ones
                for (let j = 0; j < audio_entries.length; j++){
                    if (this.settings.audio.hasOwnProperty(audio_entries[j][0])){
                        this.settings.audio[audio_entries[j][0]] = audio_entries[j][1];
                    }
                }
                // Destroy the audio pipeline if audio is disabled so that the last cached
                // buffer isn't left playing on loop
                // We also distinguish very clearly undefined from true from false
                // inside these ifs
                if      (p_settings.audio.enabled == false) this.apu.destroy_sound();
                else if (p_settings.audio.enabled == true ) this.apu.init_sound();
                // Update audio constants (buffer size, cycles/sample)
                this.apu.update_constants();
            }
            else{
                // Only redefine the entry in our settings if it already exists,
                // we don't want to create new settings
                if (this.settings.hasOwnProperty(entries[i][0])){
                    this.settings[entries[i][0]] = entries[i][1];
                }
            }
        }
    }
        
    reset(){
        // Isn't exactly a true reset but is good enough
        this.apu.destroy_sound();
        this.apu = new APU(this);
        this.ppu = new PPU(this);
        this.apu.init_sound();
        this.ppu.init_buffers();
        this.ppu.load_normal_palette();
        this.cpu.reset();
    }
    
    update_screen(){
        this.video_ctx.putImageData(
            // cur_buf indicates the buffer we are WRITING to, not the one which
            // is finished, so we need to choose the opposite
            new ImageData(this.ppu.cur_buf ? this.ppu.bk_buf : this.ppu.fr_buf, 256, 240)
            , 0
            , 0
        );
    }
    
    // Not cycle accurate but close enough
    emu_cycle_queue(){
        if (this.paused) return;
        // / 1000 to convert ms to secs, because since all of the clock speeds are
        // in HZ (cycles / sec), it makes it kinda cleaner
        let now_ts = window.performance.now() / 1000;
        let dt = Math.min(now_ts - this.prev_ts, NES.MAX_OVERDUE_COMPUTING);
        let master_cycles = dt * NES.MASTER_CLOCK_HZ;
        this.cpu_cycles_left += master_cycles * NES.CPU_CYC_PER_MASTER;
        this.ppu_cycles_left += master_cycles * NES.PPU_CYC_PER_MASTER;
        this.apu_cycles_left += master_cycles * NES.APU_CYC_PER_MASTER;
        // Emulate always the minimun amount of cycles, since we don't want
        // to make any of our counters go into the negatives
        // Also, since we can't emulate fractional master cycles,
        // we floor all of our counters
        // Finally, we need to express all of these in terms of the universal
        // master cycle, so we divide them by the conversion rate from master
        // to their own to achieve the opposite conversion
        let cycles_to_emulate = Math.min(Math.floor(this.cpu_cycles_left / NES.CPU_CYC_PER_MASTER)
                                        ,Math.floor(this.ppu_cycles_left / NES.PPU_CYC_PER_MASTER)
                                        ,Math.floor(this.apu_cycles_left / NES.APU_CYC_PER_MASTER));
        for (let i = 0; i < cycles_to_emulate; i++){
            // Emulate CPU cycle if substracting cycle amount from this pass
            // crosses a unit threshold
            if (Math.floor(this.cpu_cycles_left - NES.CPU_CYC_PER_MASTER) < Math.floor(this.cpu_cycles_left)){
                // If we have waited out the cycles from the last chunk, we can
                // execute another instruction
                if (!this.cpu_wait_cycles) this.cpu_wait_cycles += this.cpu.exec_op();
                this.cpu_wait_cycles--;
                // The APU relies on the CPU clock for the triangle wave channel's timer
                // Disabling the APU should also disable this
                if (this.settings.audio.enabled) this.apu.tri_timer_clock();
            }
            // Same for PPU
            if (Math.floor(this.ppu_cycles_left - NES.PPU_CYC_PER_MASTER) < Math.floor(this.ppu_cycles_left)){
                // The clock time calculations affect performance by such a negligeable amount
                // that I think it's fine to leave them in and short circuit just this part of the code
                if (this.settings.video.enabled){
                    // Same thing as in the CPU but for scanlines
                    if (!this.ppu_wait_dots) this.ppu_wait_dots += this.ppu.exec_dot_group();
                    this.ppu_wait_dots--;
                }
            }
            // Same for APU
            if (Math.floor(this.apu_cycles_left - NES.APU_CYC_PER_MASTER) < Math.floor(this.apu_cycles_left)){
                // The APU has such simple cycles that we can emulate them fully
                // instead of doing them in chunks, so it's much easier than the
                // other two components
                if (this.settings.audio.enabled) this.apu.exec_cycle();
            }
            // Subtract one master cycle in terms of their own cycles every pass through this loop
            this.cpu_cycles_left -= NES.CPU_CYC_PER_MASTER;
            this.ppu_cycles_left -= NES.PPU_CYC_PER_MASTER;
            this.apu_cycles_left -= NES.APU_CYC_PER_MASTER;
        }
        this.update_screen();
        // The APU handles its own output
        if ((now_ts - this.fps_update_ts) >= 1) this.update_fps(now_ts);
        this.prev_ts = now_ts;
        // I'm keeping this piece of debug code here just in case I
        // make some sort of audio visualizer later on, there's no
        // reason to delete this perfectly good piece of code
        /*
        this.ctx.strokeStyle = "#FF0000";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.apu.last_sq1_outs[0]);
        for (let i = 0; i < 256; i++){
            this.ctx.lineTo(i+1, this.apu.last_sq1_outs[i]);
        }
        this.ctx.stroke();
        */
    }

    count_frame(){
        this.frame_count++;
    }

    update_fps(now){
        let fps = Math.round(this.frame_count / (now - this.fps_update_ts));
        if (this.fps_display != null) this.fps_display.innerHTML = fps + " FPS";
        this.fps_update_ts = now;
        this.frame_count = 0;
    }
}
