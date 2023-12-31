// DOCS:
// As a pointer, just use this:
// https://www.nesdev.org/wiki/APU
// Also, a nice technical document for the APU:
// https://www.nesdev.org/apu_ref.txt

class APU{
    // Determines what value the length counter should be loaded in with when written to
    static LENGTH_COUNTER_TABLE = [
         10,
        254,
         20,
          2,
         40,
          4,
         80,
          6,
        160,
          8,
         60,
         10,
         14,
         12,
         26,
         14,
         12,
         16,
         24,
         18,
         48,
         20,
         96,
         22,
        192,
         24,
         72,
         26,
         16,
         28,
         32,
         30,
    ];
    // Determines the duty cycles (represented as bits) for the square channels
    // The reason for it's kinda odd order is that the sequencer goes in decreasing
    // order (0, 7, 6, 5, 4, 3, 2, 1)
    static DUTY_SEQUENCER_TABLE = [
        0x80, // 12.5%
        0xC0, // 25%
        0xF0, // 50%
        0x3F, // 25% negated (75%)
    ];
    // Determines how many APU cycles the linear feedback shift register
    // has to wait until the next shift, dictated by the period flag
    static LFSR_SHIFT_PERIODS   = [
           2,
           4,
           8,
          16,
          32,
          48,
          64,
          80,
         101,
         127,
         190,
         254,
         381,
         508,
        1017,
        2034,
    ];
    // Determines how many APU cycles the DMC output level
    // has to wait before changing
    static DMC_OUTPUT_RATES     = [
        214,
        190,
        170,
        160,
        143,
        127,
        113,
        107,
         95,
         80,
         71,
         64,
         53,
         42,
         36,
         27,
    ];
    
    // The APU has 5 channels: two square wave channels, one triangle wave channel,
    // one noise channel, and one DMC (Delta Modulation Channel) channel
    constructor(nes){
        this.nes                = nes;
        // APU registers are pretty complex and most of them
        // perform multiple functions, so my nomenclature for them
        // won't be the best, as such, I'll put here above their
        // declarations a shoft list with all their functions
        // Duty, halt/envelope loop, constant/envelope, envelope divider period
        this.sq1_ctrl           = 0x00;
        this.sq2_ctrl           = 0x00;
        // Enable, period, negate, shift
        this.sq1_sweep          = 0x00;
        this.sq2_sweep          = 0x00;
        // Length, timer high
        this.sq1_length         = 0x00;
        this.sq2_length         = 0x00;
        // Internal registers
        // Set when writing to the sweep register
        this.sq1_sweep_reload   = 0x00;
        this.sq2_sweep_reload   = 0x00;
        // Determines where we are on the duty cycle sequence
        this.sq1_sequencer_pos  = 0x00;
        this.sq2_sequencer_pos  = 0x00;
        // The raw reload value for the sequencer timer
        // Modified by the sweep unit
        this.sq1_raw_timer      = 0x00;
        this.sq2_raw_timer      = 0x00;
        // Clocks the sequencer when it reaches 0 and is initialized
        // based on the value of the raw timer
        this.sq1_cur_timer      = 0x00;
        this.sq2_cur_timer      = 0x00;
        // This timer is continuously calculated by the sweep unit,
        // regardless of if it's enabled or not
        this.sq1_target_timer   = 0x00;
        this.sq2_target_timer   = 0x00;
        // Keeps track of the half-frames left until we load in
        // the target period into the raw period timer
        this.sq1_sweep_divider  = 0x00;
        this.sq2_sweep_divider  = 0x00;
        // Control flag/halt, counter reload
        this.tri_linear         = 0x00;
        // Timer low
        this.tri_timer          = 0x000;
        // Length, timer high
        this.tri_length         = 0x00;
        // Internal triangle wave registers not directly exposed to the CPU
        // Linear counter reload flag
        // Is set as a side effect of writing to tri_length
        this.tri_reload         = 0x00;
        // The current value of our linear counter
        this.tri_cur_linear     = 0x00;
        // The current value of the timer divider
        this.tri_cur_timer      = 0x000;
        // The current phase of the triangle wave to be
        // used when calculating its output for a sample
        this.tri_cur_phase      = 0x00;
        // Halt/envelope loop, constant/envelope, envelope divider period
        this.noise_ctrl         = 0x00;
        // Mode, period
        this.noise_period       = 0x00;
        // Length, envelope restart (write)
        this.noise_length       = 0x00;
        // A 15-bit linear shift feedback register used internally
        // to generate the noise for the noise channel
        // Starts at value 0x0001 (see docs)
        // https://www.nesdev.org/wiki/APU_Noise
        this.noise_lfsr         = 0x0001;
        // Tracks the amount of APU cycles until the next noise
        // shift register shift
        // Starts at 4 because all registers start at 0, to the
        // period register indicates the first entry of our table
        // and to save time, we can just write 4
        this.noise_shift_wait   = 4;
        // The purposes of these registers are better shown and explained
        // in the internal loop's DMC logic and in the dmc_timer_clock() function
        // DMC exposed registers
        // IRQ, loop, rate
        this.dmc_ctrl           = 0x00;
        // These 2 registers are kept intact by us and are only modified
        // through the exposed I/O addresses
        // They are used by the reader unit to know what to reload it's
        // own internal registers to
        this.dmc_addr           = 0xC000;
        this.dmc_length         = 0x000;
        // Internal registers
        // Tracks how many APU cycles are left until we clock our level
        this.dmc_timer          = 0x000;
        // Tracks the internal state of the reader
        this.dmc_cur_addr       = 0x0000;
        this.dmc_bytes_left     = 0x000;
        this.dmc_buffer         = 0x00;
        // Tracks the sate of the output unit
        this.dmc_shift          = 0x00;
        this.dmc_bits_left      = 0x00;
        this.dmc_silence        = 0x00;
        // A number from 0 - 127 which represents the volume we are outputting currently
        this.dmc_level          = 0x00;
        // Envelope unit registers/flags
        // I recommend refreshing up on it by reading the docs if you
        // aren't exactly sure what these do:
        // https://www.nesdev.org/wiki/APU_Envelope
        // The APU has 3 envelope units, so we basically have to create
        // 3 copies of every internal register
        // Each envelope unit is for a different channel (square 1, square 2, noise)
        // The envelope loop and constant volume flags are kept in the control
        // registers of each channel, alongside some other flags
        this.sq1_env_start      = 0x00;
        this.sq2_env_start      = 0x00;
        this.noise_env_start    = 0x00;
        this.sq1_env_divider    = 0;
        this.sq2_env_divider    = 0;
        this.noise_env_divider  = 0;
        this.sq1_env_decay      = 0x00;
        this.sq2_env_decay      = 0x00;
        this.noise_env_decay    = 0x00;
        // Controls whether each channel is silenced (0) or not (1)
        // Format: ---D NT21
        // D: DMC
        // N: Noise
        // T: Triangle
        // 2: Square 2
        // 1: Square 1
        this.ctrl               = 0x00;
        // Outputs a 240Hz signal for quarter-frames
        // by counting up and sending the signal every (approx.) 3729 cycles
        // Resets once one full frame has been completed (14915 cycles, 60Hz aprox.)
        // Used for length counters, linear counters, sweep units, envelopes
        // and the frame IRQ
        this.frame_counter      = 0;
        this.frame_counter_ctrl = 0x00;
        // Stores the DMC and frame counter interrupt flags and manages them
        // Bit 7 = DMC interrupt
        // Bit 6 = Frame counter interrupt
        // This is for an easier implementation of the status read as well
        // as to make their management easier
        this.interrupt_flags    = 0x00;
        // The raw Float32Array of samples
        this.buffer             = null;
        // Since we recieve exec_cycle calls at 894.887KHz, we need to somehow
        // convert our APU clock into a 44.1KHz clock, kind of like the frame
        // counter does (in the actual APU it's called the divider)
        // For every (approx.) sample, we need to recieve 20 cycles
        this.sample_counter     = 0.0;
        // Keeps track of which sample we are going to write in the put_sample() function
        this.sample_pos         = 0;
        // Defines the size of our audio buffer
        // Calculated each time the audio settings are modified
        this.buffer_size           = 0;
        // Calculated each time the audio settings are modified
        // Defines how many APU cycles need to be clocked in order to take 1
        // sample of the current output
        // Calculated each time the audio settings are modified
        this.cyc_per_sample     = 0;
        // Our own custom AudioWorklet which stitches, mixes and fades the raw audio
        // buffers we send to it, the most essential part of the audio pipeline
        this.fader              = null;
        // The NES has both a high and low pass filter, so, we implement those by
        // adding 2 layers of biquad filters (despite how interesting it may be
        // to implement it myself, it would probably be very time consuming and
        // not as fast as the Web Audio API)
        this.low_pass           = null;
        this.high_pass          = null;
    }

    // These two functions are quite big because we have lots of internal registers
    to_json(){
        // We need to save all the registers except the
        // audio buffer, audio nodes and audio context
        return {
            sq1_ctrl:           this.sq1_ctrl,
            sq2_ctrl:           this.sq2_ctrl,
            sq1_sweep:          this.sq1_sweep,
            sq2_sweep:          this.sq2_sweep,
            sq1_length:         this.sq1_length,
            sq2_length:         this.sq2_length,
            sq1_sweep_reload:   this.sq1_sweep_reload,
            sq2_sweep_reload:   this.sq2_sweep_reload,
            sq1_sequencer_pos:  this.sq1_sequencer_pos,
            sq2_sequencer_pos:  this.sq2_sequencer_pos,
            sq1_raw_timer:      this.sq1_raw_timer,
            sq2_raw_timer:      this.sq2_raw_timer,
            sq1_cur_timer:      this.sq1_cur_timer,
            sq2_cur_timer:      this.sq2_cur_timer,
            sq1_target_timer:   this.sq1_target_timer,
            sq2_target_timer:   this.sq2_target_timer,
            sq1_sweep_divider:  this.sq1_sweep_divider,
            sq2_sweep_divider:  this.sq2_sweep_divider,
            tri_linear:         this.tri_linear,
            tri_timer:          this.tri_timer,
            tri_length:         this.tri_length,
            tri_cur_linear:     this.tri_cur_linear,
            tri_cur_timer:      this.tri_cur_timer,
            tri_cur_phase:      this.tri_cur_phase,
            noise_ctrl:         this.noise_ctrl,
            noise_period:       this.noise_period,
            noise_length:       this.noise_length,
            noise_lfsr:         this.noise_lfsr,
            noise_shift_wait:   this.noise_shift_wait,
            dmc_ctrl:           this.dmc_ctrl,
            dmc_addr:           this.dmc_addr,
            dmc_length:         this.dmc_length,
            dmc_timer:          this.dmc_timer,
            dmc_cur_addr:       this.dmc_cur_addr,
            dmc_bytes_left:     this.dmc_bytes_left,
            dmc_buffer:         this.dmc_buffer,
            dmc_shift:          this.dmc_shift,
            dmc_bits_left:      this.dmc_bits_left,
            dmc_silence:        this.dmc_silence,
            dmc_level:          this.dmc_level,
            sq1_env_start:      this.sq1_env_start,
            sq2_env_start:      this.sq2_env_start,
            noise_env_start:    this.noise_env_start,
            sq1_env_divider:    this.sq1_env_divider,
            sq2_env_divider:    this.sq2_env_divider,
            noise_env_divider:  this.noise_env_divider,
            sq1_env_decay:      this.sq1_env_decay,
            sq2_env_decay:      this.sq2_env_decay,
            noise_env_decay:    this.noise_env_decay,
            ctrl:               this.ctrl,
            frame_counter:      this.frame_counter,
            frame_counter_ctrl: this.frame_counter_ctrl,
            interrupt_flags:    this.interrupt_flags,
            sample_counter:     this.sample_counter,
            sample_pos:         this.sample_pos,
            buffer_size:        this.buffer_size,
            cyc_per_sample:     this.cyc_per_sample,
        };
    }
    
    from_json(state){
        // Version 1 of our save states has no APU state, so the NES should
        // already have a check to not try to load in the APU from the save state
        // if the version is 1 or less, however, just in case, we can add logical
        // ORs to not load in our registers with undefined, ruining our whole audio
        // processing pipeline
        this.sq1_ctrl           = state.sq1_ctrl           || 0;
        this.sq2_ctrl           = state.sq2_ctrl           || 0;
        this.sq1_sweep          = state.sq1_sweep          || 0;
        this.sq2_sweep          = state.sq2_sweep          || 0;
        this.sq1_length         = state.sq1_length         || 0;
        this.sq2_length         = state.sq2_length         || 0;
        this.sq1_sweep_reload   = state.sq1_sweep_reload   || 0;
        this.sq2_sweep_reload   = state.sq2_sweep_reload   || 0;
        this.sq1_sequencer_pos  = state.sq1_sequencer_pos  || 0;
        this.sq2_sequencer_pos  = state.sq2_sequencer_pos  || 0;
        this.sq1_raw_timer      = state.sq1_raw_timer      || 0;
        this.sq2_raw_timer      = state.sq2_raw_timer      || 0;
        this.sq1_cur_timer      = state.sq1_cur_timer      || 0;
        this.sq2_cur_timer      = state.sq2_cur_timer      || 0;
        this.sq1_target_timer   = state.sq1_target_timer   || 0;
        this.sq2_target_timer   = state.sq2_target_timer   || 0;
        this.sq1_sweep_divider  = state.sq1_sweep_divider  || 0;
        this.sq2_sweep_divider  = state.sq2_sweep_divider  || 0;
        this.tri_linear         = state.tri_linear         || 0;
        this.tri_timer          = state.tri_timer          || 0;
        this.tri_length         = state.tri_length         || 0;
        this.tri_reload         = state.tri_reload         || 0;
        this.tri_cur_linear     = state.tri_cur_linear     || 0;
        this.tri_cur_timer      = state.tri_cur_timer      || 0;
        this.tri_cur_phase      = state.tri_cur_phase      || 0;
        this.noise_ctrl         = state.noise_ctrl         || 0;
        this.noise_period       = state.noise_period       || 0;
        this.noise_length       = state.noise_length       || 0;
        this.noise_lfsr         = state.noise_lfsr         || 0;
        this.noise_shift_wait   = state.noise_shift_wait   || 0;
        this.dmc_ctrl           = state.dmc_ctrl           || 0;
        this.dmc_addr           = state.dmc_addr           || 0;
        this.dmc_length         = state.dmc_length         || 0;
        this.dmc_timer          = state.dmc_timer          || 0;
        this.dmc_cur_addr       = state.dmc_cur_addr       || 0;
        this.dmc_bytes_left     = state.dmc_bytes_left     || 0;
        this.dmc_buffer         = state.dmc_buffer         || 0;
        this.dmc_shift          = state.dmc_shift          || 0;
        this.dmc_bits_left      = state.dmc_bits_left      || 0;
        this.dmc_silence        = state.dmc_silence        || 0;
        this.dmc_level          = state.dmc_level          || 0;
        this.sq1_env_start      = state.sq1_env_start      || 0;
        this.sq2_env_start      = state.sq2_env_start      || 0;
        this.noise_env_start    = state.noise_env_start    || 0;
        this.sq1_env_divider    = state.sq1_env_divider    || 0;
        this.sq2_env_divider    = state.sq2_env_divider    || 0;
        this.noise_env_divider  = state.noise_env_divider  || 0;
        this.sq1_env_decay      = state.sq1_env_decay      || 0;
        this.sq2_env_decay      = state.sq2_env_decay      || 0;
        this.noise_env_decay    = state.noise_env_decay    || 0;
        this.ctrl               = state.ctrl               || 0;
        this.frame_counter      = state.frame_counter      || 0;
        this.frame_counter_ctrl = state.frame_counter_ctrl || 0;
        this.interrupt_flags    = state.interrupt_flags    || 0;
        this.sample_counter     = state.sample_counter     || 0;
        this.sample_pos         = state.sample_pos         || 0;
        this.buffer_size        = state.buffer_size        || 0;
        this.cyc_per_sample     = state.cyc_per_sample     || 0;
    }

    // Audio pipeline:
    // put_sample ══> buffer ══> fader ══> low_pass ══> high_pass ══> ctx.destination
    // Called after all the audio nodes have been created
    init_pipeline(){
        this.fader.connect(this.low_pass);
        this.low_pass.connect(this.high_pass);
        this.high_pass.connect(this.nes.audio_ctx.destination);
        let pause_handler = () => {
            // Only taking into account if the document is focused can be pretty
            // misleading, since someone using a side-by-side layout would get their
            // game silenced for just cliking off for a second, so we also count the
            // document as unpaused if it's visible
            let active = (document.visibilityState == "visible") || document.hasFocus();
            // Disconnect the pipeline from the speakers to effectively silence it
            // when we are unfocused and inform the fader of it just in case it helps
            // reduce popping
            this.fader.port.postMessage({ type: "pause_state", paused: (!active)});
            if (active) this.high_pass.connect(this.nes.audio_ctx.destination);
            else        this.high_pass.disconnect();
        }
        document.addEventListener("focus"           , () => { pause_handler(); });
        document.addEventListener("blur"            , () => { pause_handler(); });
        document.addEventListener("visibilitychange", () => { pause_handler(); });
    }

    update_constants(){
        // Pretty self-explanatory equations, you can verify them just by looking
        // at how the units (sample, Hz) interact and cancel out
        this.buffer_size    = Math.round(this.nes.settings.audio.sample_rate / this.nes.settings.audio.buffer_out_hz);
        this.cyc_per_sample = NES.APU_CLOCK_HZ / this.nes.settings.audio.sample_rate;
        // We should also update the buffer with our new length
        this.buffer         = new Float32Array(this.buffer_size);
        // Finally notify the fader of these new constants, as well as the ones defined in the NES
        this.fader.port.postMessage({
            type: "settings_update",
            mode: this.nes.settings.audio.buffer_mixing,
            buffer_size: this.buffer_size,
            fade_samples: this.nes.settings.audio.fade_samples,
            loop_keep_samples: this.nes.settings.audio.loop_keep_samples,
        });
    }
    
    init_sound(){
        this.buffer                    = new Float32Array(APU.BUF_SIZE);
        this.low_pass                  = this.nes.audio_ctx.createBiquadFilter();
        this.low_pass.type             = "lowpass";
        this.low_pass.frequency.value  = 14_000;
        this.high_pass                 = this.nes.audio_ctx.createBiquadFilter();
        this.high_pass.type            = "highpass";
        // In reality, the NES applies 2 high-pass filters, one at 90Hz
        // and another afterwards at 440Hz, which just effectively results
        // in a 440Hz highpass filter (I think)
        this.high_pass.frequency.value = 440;
        // Try to create our audio fader
        try{
            this.fader = new AudioWorkletNode(this.nes.audio_ctx, "AudioFader");
            this.init_pipeline();
            this.update_constants();
        }
        // Register it if it hasn't already been registered
        catch(e){
            this.nes.audio_ctx.audioWorklet.addModule("/script/apu.js").then(() => {
                this.fader = new AudioWorkletNode(this.nes.audio_ctx, "AudioFader");
                this.init_pipeline();
                this.update_constants();
            });
        }
    }

    destroy_sound(){
        // Make sure that everything is disconnected and closed
        this.fader.disconnect();
        this.low_pass.disconnect();
        this.high_pass.disconnect();
    }

    // All the setters are kinda bulky, but it is what it is
    set_sq1_ctrl(val){
        this.sq1_ctrl = val;
    }

    set_sq1_sweep(val){
        this.sq1_sweep = val;
        // Writing to this register sets the reload flag 
        this.sq1_sweep_reload = 0x01;
    }

    set_sq1_timer(val){
        // Sets only the 8 LSB of the timer
        this.sq1_raw_timer = (this.sq1_raw_timer & 0x700) | val;
    }

    // A side-effect of writing to the length counters of any
    // channel with an envelope unit is that it sets that envelope's
    // start flag
    set_sq1_length(val){
        // The length counter only has the 5 MSB of the value written
        // reserved to determine its table entry, this is true for every channel
        this.sq1_length        = APU.LENGTH_COUNTER_TABLE[(val & 0xF8) >> 3];
        // The other 3 bits are the 3 MSB of the timer
        this.sq1_raw_timer     = ((val & 0x07) << 8) | (this.sq1_raw_timer & 0x0FF);
        this.sq1_env_start     = 0x01;
        // Sequencer is also restarted
        this.sq1_sequencer_pos = 0x00;
    }

    // Exactly the same logic for the second square channel
    set_sq2_ctrl(val){
        this.sq2_ctrl = val;
    }

    set_sq2_sweep(val){
        this.sq2_sweep = val;
        this.sq2_sweep_reload = 0x01;
    }

    set_sq2_timer(val){
        this.sq2_raw_timer = (this.sq2_raw_timer & 0x700) | val;
    }

    set_sq2_length(val){
        this.sq2_length        = APU.LENGTH_COUNTER_TABLE[(val & 0xF8) >> 3];
        this.sq2_raw_timer     = ((val & 0x07) << 8) | (this.sq2_raw_timer & 0x0FF);
        this.sq2_env_start     = 0x01;
        this.sq2_sequencer_pos = 0x00;
    }

    set_tri_linear(val){
        this.tri_linear = val;
    }

    set_tri_timer(val){
        // Sets only the 8 LSB of timer
        this.tri_timer = (this.tri_timer & 0x700) | val;
    }

    set_tri_length(val){
        this.tri_length = APU.LENGTH_COUNTER_TABLE[(val & 0xF8) >> 3];
        this.tri_timer  = ((val & 0x07) << 8) | (this.tri_timer & 0x0FF);
        // A side-effect of writing to this port is that it restarts the linear counter
        this.tri_reload = 0x01;
    }

    set_noise_ctrl(val){
        this.noise_ctrl = val;
    }

    set_noise_period(val){
        this.noise_period = val;
    }

    set_noise_length(val){
        this.noise_length = APU.LENGTH_COUNTER_TABLE[(val & 0xF8) >> 3];
        this.noise_env_start = 0x01;
    }

    set_dmc_ctrl(val){
        this.dmc_ctrl = val;
    }

    set_dmc_level(val){
        this.dmc_level = val & 0x7F;
    }

    set_dmc_addr(val){
        this.dmc_addr = 0xC000 | (val << 6);
    }

    set_dmc_length(val){
        // The DMC channel is special, as its length represents sample
        // bytes left to be played, not a duration in half-frames
        this.dmc_length = (val << 4) | 0x001;
    }

    get_status(){
        // Reports both interrupt flags (frame counter, DMC)
        // and whether the length counter for each channel
        // is above 0
        let tmp = this.interrupt_flags
                 // Bit 5 is open bus (but I implement it as 0)
                 |((!!this.dmc_bytes_left)        << 4)
                 |((!!(this.noise_length & 0xF8)) << 3)
                 |((!!(this.tri_length   & 0xF8)) << 2)
                 |((!!(this.sq2_length   & 0xF8)) << 1)
                 |((!!(this.sq1_length   & 0xF8)) << 0);
        // Reading this address clears the frame IRQ flag
        this.interrupt_flags = 0xBF;
        return tmp;
    }

    set_ctrl(val){
        this.ctrl = val;
        // The DMC channel works a little differently than the rest
        // If the DMC bit is clear, the bytes remaining counter will
        // be set to 0 and the DMC will be silenced when it the buffer empties
        if (!(this.ctrl & 0x10)) this.dmc_bytes_left = 0;
        // Otherwise reset the reader if the bytes left are 0
        // Only resetting the reader means whatever is left in the
        // 1 byte buffer will finish playing before actually resetting
        else if (this.dmc_bytes_left == 0){
            this.dmc_cur_addr   = this.dmc_addr;
            this.dmc_bytes_left = this.dmc_length;
        }
    }

    set_frame_counter_ctrl(val){
        this.frame_counter_ctrl = val;
        // Writing to this register resets the frame counter
        // and generates a half-frame and quater-frame signal
        this.quarter_frame();
        this.half_frame();
        // In reality, the reset of the frame counter occurs 3-4 CPU cycles
        // after the write, but it doesn't really matter for the purpose
        // of this emulator
        this.frame_counter = 0;
    }

    // Back to actual code
    calc_sq1_out(){
        // The pulse channels can't output frequencies above 12.4KHz (t < 8)
        if (this.sq1_raw_timer < 8) return 0;
        let duty_table = APU.DUTY_SEQUENCER_TABLE[(this.sq1_ctrl & 0xC0) >>> 6];
        let cur_bit = duty_table & (1 << this.sq1_sequencer_pos);
        // Return silence if the current duty bit is clear
        if (!cur_bit) return 0;
        // The sweep unit silences the channel when the target period
        // exceeds 0x7FF (a.k.a. when there is a carry out in its adder)
        if (this.sq1_target_timer > 0x7FF) return 0;
        // Now we can just output the envelope unit's output
        // If constant volume flag is set, return
        // V from out control register
        if (this.sq1_ctrl & 0x10) return this.sq1_ctrl & 0x0F;
        // Otherwise return envelope decay
        return this.sq1_env_decay;
    }

    // Same for sq2
    calc_sq2_out(){
        if (this.sq2_raw_timer < 8) return 0;
        let duty_table = APU.DUTY_SEQUENCER_TABLE[(this.sq2_ctrl & 0xC0) >>> 6];
        let cur_bit = duty_table & (1 << this.sq2_sequencer_pos);
        if (!cur_bit) return 0;
        if (this.sq2_target_timer > 0x7FF) return 0;
        if (this.sq2_ctrl & 0x10) return this.sq2_ctrl & 0x0F;
        return this.sq2_env_decay;
    }

    calc_tri_out(){
        // Return silence if the period is of an ultrasonic frequency
        // This is used by many games to silence the triangle channel, and with
        // this workaround, we manage that same effect and keep the fidelity
        // of a slight pop when switching back to an audible frequency
        if (this.tri_timer < 2) return 0;
        // We need to convert the triangle phase we are
        // keeping track of from what would be a saw wave
        // into a triangle wave
        // If we are in the first half of the period, invert
        // our phase (0->15, 1->14, 2->13...15->0)
        if (this.tri_cur_phase <= 15) return 15 - this.tri_cur_phase;
        // Otherwise we need to shift it down (16->0, 17->1, 18->2...31->15)
        return this.tri_cur_phase - 16;
    }
    
    calc_noise_out(){
        // If bit 0 is set we return silence
        if (this.noise_lfsr & 0x0001) return 0;
        // Otherwise return current envelope volume
        // If constant volume flag is set, return
        // V from out control register
        if (this.noise_ctrl & 0x10) return this.noise_ctrl & 0x0F;
        // Otherwise return envelope decay
        return this.noise_env_decay;
    }

    mix_sample(p1, p2, t, n, d){
        // Mixes all the 5 channel's raw output (for some
        // p1, p2, t, n it's 0-15, for d it's 0-127)
        // The mixing scheme is weirdly non-linear
        // This could be done faster with a linear approximation
        // or a couple lookup tables, but I don't think these float
        // operation will hurt performance much, specially considering
        // that we pass through here relatively infrequently
        // These formulas are taken directly from the wiki:
        // https://www.nesdev.org/wiki/APU_Mixer
        // We don't need to worry about all the signals
        // in one group (p or tnd) all being 0 causing
        // a division by 0, because JS can handle floating point
        // arithmetic with infinity without issues, keeping
        // all the rules we would normally expect (inf + n = inf,
        // 1 / 0 = inf, 1 / inf = 0...)
        let tnd_denom = 1.0 / ((t / 8227.0) + (n / 12241.0) + (d / 22638.0));
        let tnd_out   = 159.79 / (tnd_denom + 100.0);
        let p_denom   = 8128.0 / (p1 + p2);
        let p_out     = 95.88 / (p_denom + 100.0);
        // Convert the [0.0, 1.0] range sample that p_out + tnd_out
        // gives us into a [-1.0, 1.0] range sample
        return (2.0 * (p_out + tnd_out)) - 1.0;
    }

    put_sample(){
        // All channel's output ranges from 0-15, except for the
        // DMC, which goes from 0-127
        let sq1_out   = 0;
        let sq2_out   = 0;
        let tri_out   = 0;
        let noise_out = 0;
        // Calcute sq1 and sq2 if the length counter is not 0 and the control
        // register has the enable flag for the channel set
        if (this.sq1_length && (this.ctrl & 0x01)) sq1_out = this.calc_sq1_out();
        if (this.sq2_length && (this.ctrl & 0x02)) sq2_out = this.calc_sq2_out();
        // Calculate triangle if it's enabled in the control register,
        // and both the length and linear counters are not 0
        if (this.tri_length && this.tri_cur_linear && (this.ctrl & 0x04)) tri_out = this.calc_tri_out();
        // Calculate noise on the same criteria as sq1 and sq2
        if (this.noise_length && (this.ctrl & 0x08)) noise_out = this.calc_noise_out();
        // Returns a sample in the range [-1.0, 1.0]
        // The DMC has a quite simple output for us here, because all of the work
        // is done when we are clocking it, here we just simply read the level
        // that it's on
        let mix_out   = this.mix_sample(sq1_out, sq2_out, tri_out, noise_out, this.dmc_level);
        // Apply our own sort of mixer with volume
        let final_out = mix_out * this.nes.settings.audio.volume;
        this.buffer[this.sample_pos] = mix_out;
        this.sample_pos++;
        if (this.sample_pos >= this.buffer_size){
            // Send in our filled up buffer to the fader through the I/O port
            // We have to add the check to see if it's not null because since it's initialized
            // in a promise, at the beginning we may pass through here while it's not initialized yet
            if (this.fader) this.fader.port.postMessage({ type: "buffer_stream", buf: this.buffer });
            this.sample_pos = 0;
        }
    }

    // Calculates the target period that the sweep unit would like
    // to write to the raw timer
    sq1_calc_target_period(){
        // Calculate change amount based of the current raw period
        // shifted right by the shift amount
        let change_amount = this.sq1_raw_timer >>> (this.sq1_sweep & 0x07);
        // If negate flag is set, make it negative by adding the one's complement
        if (this.sq1_sweep & 0x08) change_amount = (~change_amount) & 0x7FF;
        this.sq1_target_timer = this.sq1_raw_timer + change_amount;
        if (this.sq1_sweep & 0x08){
            // If the negative flag is set, the target period's borrow must
            // be discarded, however, if it was 1, the target period is clamped to 0
            if (this.sq1_target_timer & 0x800) this.sq1_target_timer  &= 0x7FF;
            else                                this.sq1_target_timer  = 0x000;
        }
    }

    // Same as sq1
    sq2_calc_target_period(){
        let change_amount = this.sq2_raw_timer >>> (this.sq2_sweep & 0x07);
        // The only difference with sq1 is that the negate flag adds the two's
        // complement instead of the one's complement, due to different internal wiring
        // of the adder's carry
        if (this.sq2_sweep & 0x08) change_amount = ((~change_amount) + 1) & 0x7FF;
        this.sq2_target_timer = this.sq2_raw_timer + change_amount;
        if ((this.sq2_sweep & 0x08) && (this.sq2_target_timer < 0x7FF)) this.sq2_target_timer = 0x000;
    }
    
    // The sequencer clocks are quite simple
    sq1_sequencer_clock(){
        this.sq1_sequencer_pos = (this.sq1_sequencer_pos - 1) & 0x07;
    }

    sq2_sequencer_clock(){
        this.sq2_sequencer_pos = (this.sq2_sequencer_pos - 1) & 0x07;
    }
    
    // Since the triangle channel's timer is clocked by the CPU's clock,
    // unlike the square channels which are clocked by the APU's clock,
    // we have to rely on the NES internal loop to call this function
    // everytime a CPU cycle occurs for us to clock our triangle timer
    tri_timer_clock(){
        // Clock our phase and reset timer if it's 0
        if (this.tri_cur_timer == 0){
            this.tri_cur_phase = (this.tri_cur_phase + 1) % 32;
            this.tri_cur_timer = this.tri_timer;
        }
        // Otherwise decrease it
        else this.tri_cur_timer--;
    }

    noise_lfsr_clock(){
        // The feedback bit is set to the EOR of the LSFR's
        // bit 0 and bit 1 (M = 0) or bit 6 (M = 1)
        // MSB of the period register denotates the mode
        let sec_bit = (this.noise_period & 0x80)
                   ? ((this.noise_lfsr & 0x0040) >>> 6)
                   : ((this.noise_lfsr & 0x0002) >>> 1);
        let fb_bit  = (this.noise_lfsr & 0x0001) ^ sec_bit;
        // Shift register right by 1, put out feeback bit in the MSB (bit 14)
        this.noise_lfsr = (fb_bit << 14) | (this.noise_lfsr >>> 1);
    }

    dmc_timer_clock(){
        // DMC reader refills sample buffer if it has been emptied
        // and sample is not over
        if ((this.dmc_buffer == 0x00) && this.dmc_bytes_left){
            // Read sample buffer from memory
            this.dmc_buffer = this.nes.mmap.get_byte(this.dmc_cur_addr);
            // Update sample address
            this.dmc_cur_addr++;
            // The address register's wrapping is unusual
            if (this.dmc_cur_addr > 0xFFFF) this.dmc_cur_addr = 0x8000;
            // Update how much of the sample is left
            this.dmc_bytes_left--;
            // Reading a byte from our sample is kind of complex and
            // has lots of cycle-specific shenanigans, so read the docs
            // if you want more details, but to make things simple, it
            // most of the time stalls the CPU for 4 cycles
            this.nes.cpu_wait_cycles += 4;
            // If the sample has finished
            if (this.dmc_bytes_left == 0){
                // Reset reader if loop flag is set
                if (this.dmc_ctrl & 0x40){
                    this.dmc_bytes_left = this.dmc_length;
                    this.dmc_cur_addr   = this.dmc_addr;
                }
                // Otherwise set interrupt flag if interrupt enable flag is set
                // and request IRQ
               else if (this.dmc_ctrl & 0x80){
                   this.interrupt_flags |= 0x80;
                   // In reality, the DMC channel continously steps on the IRQ line's
                   // value if the interrupt flag is set until it has been acknowledged,
                   // but it doesn't really matter for the purpose of this emulator
                   this.nes.cpu.req_irq = true;
               }
            }
        }
        // Output unit logic
        // If our shift register needs to be refilled, refill it
        // with the contents of the sample buffer and empty it
        if (this.dmc_bits_left == 0){
            // Update silence flag (set if buffer is empty, clear if buffer isn't)
            this.dmc_silence = !this.dmc_buffer;
            // Update shift and buffer
            this.dmc_shift  = this.dmc_buffer;
            this.dmc_buffer = 0x00;
            // Reset bit counter
            this.dmc_bits_left = 8;
        }
        // Update level if silence is clear
        if (!this.dmc_silence){
            // Increase level by 2 if bit 0 of the shift register is set
            if (this.dmc_shift & 0x01){
                // Only increase if it won't overflow past a value of 0x7F
                if (this.dmc_level <= 0x7D) this.dmc_level += 0x02;
            }
            // Otherwise decrease by 2 
            else{
                // Only if decrease won't overflow below a value of 0x00
                if (this.dmc_level >= 0x02) this.dmc_level -= 0x02;
            }
        }
        // Clock shift register
        this.dmc_shift >>>= 1;
        // Decrease bit counter
        this.dmc_bits_left--;
    }
    
    quarter_frame(){
        // Triangle channel linear timer logic
        // If reload flag is set, reload linear counter
        // with value stored in the register
        if (this.tri_reload){
            // The MSB is reserved for the control/halt flag
            this.tri_cur_linear = this.tri_linear & 0x7F;
            // If control flag is clear, reload flag is cleared
            if (!(this.tri_linear & 0x80)) this.tri_reload = 0x00;
        }
        // Otherwise decrease linear counter until it's 0
        else if (this.tri_cur_linear) this.tri_cur_linear--;
        // Envelope update logic
        // We have to do the same thing for the 3 envelope units
        // Reset registers if start flag is set
        if (this.sq1_env_start){
            this.sq1_env_start   = 0x00;
            this.sq1_env_decay   = 0x0F;
            // Reload divider with divider period register
            this.sq1_env_divider = this.sq1_ctrl & 0x0F;
        }
        // Otherwise clock divider
        else{
            // If divider is 0, reload it with V and clock
            // decay level counter
            if (this.sq1_env_divider == 0){
                this.sq1_env_divider = this.sq1_ctrl & 0x0F;
                // If decay level is non-zero, decrease it
                if (this.sq1_env_decay) this.sq1_env_decay--;
                // Otherwise reload it with 15 if loop flag is set
                else if (this.sq1_ctrl & 0x20) this.sq1_env_decay = 0x0F;
            }
            // Otherwise just decrease it
            else this.sq1_env_divider--;
        }
        // Same for square 2
        if (this.sq2_env_start){
            this.sq2_env_start   = 0x00;
            this.sq2_env_decay   = 0x0F;
            this.sq2_env_divider = this.sq2_ctrl & 0x0F;
        }
        else{
            if (this.sq2_env_divider == 0){
                this.sq2_env_divider = this.sq2_ctrl & 0x0F;
                if (this.sq2_env_decay) this.sq2_env_decay--;
                else if (this.sq2_ctrl & 0x20) this.sq2_env_decay = 0x0F;
            }
            else this.sq2_env_divider--;
        }
        // Same for noise
        if (this.noise_env_start){
            this.noise_env_start   = 0x00;
            this.noise_env_decay   = 0x0F;
            this.noise_env_divider = this.noise_ctrl & 0x0F;
        }
        else{
            if (this.noise_env_divider == 0){
                this.noise_env_divider = this.noise_ctrl & 0x0F;
                if (this.noise_env_decay) this.noise_env_decay--;
                else if (this.noise_ctrl & 0x20) this.noise_env_decay = 0x0F;
            }
            else this.noise_env_divider--;
        }
    }

    half_frame(){
        // Decrease length counters if the halt flag is clear,
        // the channel is enabled and the length left isn't 0
        if ((!(this.sq1_ctrl & 0x20)) && (this.ctrl & 0x01)){
            if (this.sq1_length) this.sq1_length--;
        }
        if ((!(this.sq2_ctrl & 0x20)) && (this.ctrl & 0x02)){
            if (this.sq2_length) this.sq2_length--;
        }
        if ((!(this.tri_linear & 0x80)) && (this.ctrl & 0x04)){
            if (this.tri_length) this.tri_length--;
        }
        if ((!(this.noise_ctrl & 0x20)) && (this.ctrl & 0x08)){
            if (this.noise_length) this.noise_length--;
        }
        // Sweep unit period update logic
        // If divider is 0, try to load in target period into raw period timer
        if (this.sq1_sweep_divider == 0){
            // Only update period timer if sweep unit is enabled and it's
            // not muting the channel
            if (this.sq1_sweep & 0x80){
                this.sq1_raw_timer = this.sq1_target_timer & 0x7FF;
            }
        }
        // After that, if the divider is 0 or the reload flag is set,
        // the reload flag is cleared and the divider is loaded in with the bits
        // in the setup register
        if ((this.sq1_sweep_divider == 0) || this.sq1_sweep_reload){
            if ((this.sq1_sweep & 0x80) && (this.sq1_raw_timer >= 8) && (this.sq1_target_timer <= 0x7FF)){
                this.sq1_raw_timer = this.sq1_target_timer;
            }
        }
        // Otherwise decrement divider
        else this.sq1_sweep_divider--;
        // Same for sq2
        if (this.sq2_sweep_divider == 0){
            if ((this.sq2_sweep & 0x80) && (this.sq2_raw_timer >= 8) && (this.sq2_target_timer <= 0x7FF)){
                this.sq2_raw_timer = this.sq2_target_timer;
            }
        }
        if ((this.sq2_sweep_divider) == 0 || this.sq2_sweep_reload){
            this.sq2_sweep_divider = (this.sq2_sweep & 0x70) >>> 4;
            this.sq2_sweep_reload  = 0x00;
        }
        else this.sq2_sweep_divider--;
    }

    exec_cycle(){
        // Interrupt flag logic
        // If an interrupt of either is disabled, immediatly clear corresponding flag
        if (  this.frame_counter_ctrl & 0x40 ) this.interrupt_flags &= 0xBF;
        if (!(this.dmc_ctrl           & 0x80)) this.interrupt_flags &= 0x7F;
        // In actuallity, we need 20.292222222... cycles per sample, so 
        // we can just linearly add 1 to our sample counter and subtract
        // 20.29 everytime we add a sample to occassionally skip a cycle call
        // and do 20 instead of 21 to keep the ratio as exact as possible
        if (this.sample_counter >= this.cyc_per_sample){
            this.put_sample();
            this.sample_counter -= this.cyc_per_sample;
        }
        // We always increase the sample counter
        this.sample_counter++;
        // The sweep unit always recalculates it's target period, regardless
        // of if it's enabled or not
        this.sq1_calc_target_period();
        this.sq2_calc_target_period();
        // Square channels sequencer clock logic
        // If timer is 0 we can clock the sequencer and reset it
        if (this.sq1_cur_timer == 0){
            this.sq1_sequencer_clock();
            this.sq1_cur_timer = this.sq1_raw_timer;
        }
        // Otherwise decrease the timer
        else this.sq1_cur_timer--;
        // Same for sq2
        if (this.sq2_cur_timer == 0){
            this.sq2_sequencer_clock();
            this.sq2_cur_timer = this.sq2_raw_timer;
        }
        else this.sq2_cur_timer--;
        // LFSR clock logic
        if (this.noise_shift_wait == 0){
            this.noise_lfsr_clock();
            // Lowest 4 bits denote the period length
            this.noise_shift_wait = APU.LFSR_SHIFT_PERIODS[this.noise_period & 0x0F];
        }
        // We always decrease the LFSR shift wait
        this.noise_shift_wait--;
        // DMC clock logic
        if (this.dmc_timer == 0){
            this.dmc_timer_clock();
            this.dmc_timer = APU.DMC_OUTPUT_RATES[this.dmc_ctrl & 0x0F];
        }
        // We always decrease the DMC timer
        this.dmc_timer--;
        // Frame counter logic and the triangle linear counter
        // Quarter-frames update the envelopes
        // Half-frames update the length counters and sweep units
        // Full-frames request an IRQ in 4-step mode
        if      (this.frame_counter == 3729){ // Quater frame
            this.quarter_frame();
        }
        else if (this.frame_counter == 7457){ // Half frame
            this.half_frame();
            // Half-frames also execute quarter-frames
            this.quarter_frame();
        }
        else if (this.frame_counter == 11186){ // Quarter frame
            this.quarter_frame();
        }
        // The only 2 differences between 4-step mode (status bit 7 = 0)
        // and 5-step mode (status bit 7 = 1) are that 4-step mode can produce IRQs
        // while 5-step mode can't, and that 5-step mode has an extra frame count
        // which does nothing, not even a quarter-frame, which is placed where
        // the full-frame count for 4-step mode would be, so we can simply check
        // which mode we are in to see how many cycles we should wait to count
        // the last frame counter output
        else if (this.frame_counter == ((this.frame_counter_ctrl & 0x80) ? 18641 : 14915)){ // Full frame
            // Full-frames execute half-frame and quarter-frame logic as well
            this.half_frame();
            this.quarter_frame();
            // In reality, there's a subtlety of half a real APU cycles (1 CPU cycle)
            // of when the IRQ is requested and when the half-frame and quater-frame are counted,
            // but it really doesn't matter for the purpose of this emulator
            // Only set interrupt flag and request IRQ if interrupt inhibit flag is cleared
            // and we are in 4-step mode
            if ((this.frame_counter_ctrl & 0xC0) == 0x40){
                this.interrupt_flags |= 0x40;
                this.nes.cpu.req_irq = true;
            }
            // Reset frame counter on the last count
            this.frame_counter = 0;
            // Return here to not go onto the frame_counter++ line
            return;
        }
        this.frame_counter++;
    }
}

// Our own AudioWorkletProcessor in charge of performing all the stitching
// of the audio buffers we send in to it, think of it as our own custom
// sound chip/mixer, to which we send our buffers without worries
// The APU does still have to take care of the rest of the audio pipeline, though
// We put this in a try catch statement because the declaraction of this class is
// only supposed to occur inside the scope of the audio context, where
// AudioWorkletProcessor exists, however it automatically tries to declare this class
// when the document is loaded, so we have to catch that error and ignore it
try{
    // AudioFader mixing diagram:
    //                                                                            Pause state
    //                                                                                 ║
    // Audio pipeline ══╦═> Buffer playback ══╗          ╔════════════> Last sample    ║
    // buffer stream    ║      cursor         ║          ║                   ║         ║
    //                  ║                     ╠══> Current sample ══╗        ║         ║
    //                  ║                     ║                     ║        ║         ║
    //                  ╠═> Current buffer ═══╝                     ║        ║         ║
    //                  ║         ║                                 ║        ║         ║
    //                  ║         v                                 ║        ║         ║
    //                  ║   Buffer smoother                         ║        ╚═════════╣
    //                  ║         ║                                 ║                  ║
    //                  ║         v                                 ╠══> Linear mixer ═╩═> Audio pipeline
    //                  ║    Fade buffer ═════╗                     ║
    //                  ║                     ║                     ║
    //                  ║                     ╠══> Fade sample ═════╣
    //                  ║                     ║                     ║
    //                  ╠=> Fade playback ════╝                     ║
    //                  ║       cursor                              ║
    //                  ║                                           ║
    //                  ║                                           ║
    //                  ╚═>  Fade length ═══════════════════════════╝
    //                        counter
    class AudioFader extends AudioWorkletProcessor{
        static FADE_SAMPLES      = 200;
        static LOOP_KEEP_SAMPLES = 250;

        constructor(...args){
            super(...args);
            // Defines what we should do with the buffers that arrive to us
            // (none = no mixing, fade = our mixing architecture)
            this.buffer_mixing_mode  = "none";
            // Start off our buffers with just 1 sample to not cause any issues
            // Stores the audio buffer we are currently playing, and is
            // moved into the last_buf register once we are done playing it
            // (it is smoothed out for looping before that)
            this.cur_buf             = new Float32Array(1);
            // Is always designed to be played in a loop without any audio pops
            // and is also used to fade in the new buffers which come in
            this.last_buf            = new Float32Array(1);
            // Represents how far along in our current audio buffer we are, and
            // isn't touched once we reach the end until we receive a new buffer
            this.cur_buf_cursor      = 0;
            // Represents what sample in the last buffer we are playing, and is
            // always looping around, but a gate in our architecture stops it
            // from actually adding the sample to the mixer
            this.last_buf_cursor     = 0;
            // Tracks how many more samples are left to fade in
            this.fade_length_counter = 0;
            // A simple register for an internal gate which stops new sound
            // from exiting us if we are paused
            this.paused              = false;
            // Keeps the last sample we played to reduce audio popping when
            // we stop outputting new audio once we are paused
            this.last_sample         = 0.0;
            // These last properties are simply mirrors of what we have in our
            // NES and our APU, since we cant directly communicate with them
            this.buffer_size         = 1;
            // Explained in the declaration of settings in nes.js
            this.fade_samples        = 1;
            this.loop_keep_samples   = 1;
            // This is the only way we can communicate with our corresponding
            // AudioNode, so whenever we receive a message, we process what information
            // it is communicating to us and act accordingly
            this.port.onmessage = (e) => {
                if (e.data.type == "buffer_stream"){
                    // Sets all of our internal registers so that we immediatly start
                    // playing and fading in the new buffer
                    // Store the buffer we just got sent
                    this.cur_buf = e.data.buf;
                    // Reset playback cursor
                    this.cur_buf_cursor = 0;
                }
                else if (e.data.type == "pause_state"){
                    // This is a pretty simple message to handle,
                    // just set the pause state to what we are told
                    this.paused = e.data.paused;
                }
                else if (e.data.type == "settings_update"){
                    // Just update the corresponding settings registers
                    this.buffer_mixing_mode = e.data.mode;
                    this.buffer_size        = e.data.buffer_size;
                    this.fade_samples       = e.data.fade_samples;
                    this.loop_keep_samples  = e.data.loop_keep_samples;
                    // We should also update our buffers to be new size specified
                    this.cur_buf            = new Float32Array(this.buffer_size);
                    this.last_buf           = new Float32Array(this.buffer_size);
                    // Also reset the cursors just in case
                    this.cur_buf_cursor     = 0;
                    this.last_buf_cursor    = 0;
                }
            };
        }

        // Returns a smoothed out version of the buffer in the beginning samples so that it
        // can be replayed without popping
        smooth(buf){
            // We make sure our new buffer is completely new, not a reference to the old buffer
            let smooth_buf = new Float32Array(buf);
            // We use basically the same formula that we use in produce_sample (see below)
            for (let i = 0; i < this.fade_samples; i++){
                // We count backwards from the end of the buffer
                let cur_sample   = buf[this.buffer_size - this.loop_keep_samples + i];
                let fade_sample  = buf[this.buffer_size - this.fade_samples      + i];
                let mixed_sample = (((this.fade_samples - i) * fade_sample)
                                 +   (i                            * cur_sample ))
                                 /    this.fade_samples;
                smooth_buf[this.buffer_size - this.loop_keep_samples + i] = mixed_sample;
            }
            return smooth_buf;
        }
        
        produce_fade_sample(){
            // We always produce and mix samples, the code managing our registers
            // automatically takes care of making sure that they are at values
            // which produce the desired results
            // We also use % to make sure we don't go out of bounds of the buffer's length
            let cur_sample  = this.cur_buf[this.cur_buf_cursor   % this.buffer_size];
            let fade_sample = this.last_buf[this.last_buf_cursor % this.buffer_size];
            // Scales according to the weight coefficients
            let mix_out     = ((this.fade_length_counter                      * fade_sample)
                            + ((this.fade_samples - this.fade_length_counter) * cur_sample))
                            /   this.fade_samples;
            // Mixing formula:
            // LF + (T - L)C
            // -------------
            //       T
            // C = Current sample
            // F = Fade sample
            // L = Fade length counter
            // T = Total fade samples
            // In short, this formula produces two scaling coefficients: L and (T - L),
            // which start, respectively, at T and 0, which then linearly shift to being,
            // respectively, at 0 and T. Finally, we divide the expression by T to scale
            // these components to being between 0 and 1 to multiply them by their values,
            // producing our desired weighted average.
            return mix_out;
        }

        // Executes a sample and returns its mixed value, while also handling the
        // internal register control logic with each pass
        exec_fade_sample(){
            // We always calculate the mixer output, since the registers are setup
            // in such a way that the mixer always produces the desired samples
            let mix_out = this.produce_fade_sample();
            // Internal register control logic
            // Always increase the fade buffer playback cursor and make it loop if it
            // reaches the end of the buffer
            this.last_buf_cursor++;
            if (this.last_buf_cursor >= this.buffer_size){
                // We reset it counting from the end of the buffer to LOOP_KEEP_SAMPLES
                this.last_buf_cursor = this.buffer_size - this.loop_keep_samples;
            }
            // If we are still playing the new buffer normally, increase
            // the playback cursor and decrease the length counter if it's not 0
            if (this.cur_buf_cursor < this.buffer_size){
                this.cur_buf_cursor++;
                if (this.fade_length_counter) this.fade_length_counter--;
            }
            // Otherwise if we have just run out of buffer fill the buffer
            // with the smoothed version lf our current one, set the length
            // counter to max for it to start counting down when we receive
            // a new buffer, increas the cursor so that this event doesn't
            // repeat and reset the fade counter cursor
            else if (this.cur_buf_cursor == this.buffer_size){
                this.last_buf = this.smooth(this.cur_buf);
                this.last_buf_cursor = this.buffer_size - this.loop_keep_samples;
                this.fade_length_counter = this.fade_samples;
                this.cur_buf_cursor++;
            }
            // If we are paused, we override our output to the last sample we played to keep
            // the signal level the same and not produce pops
            mix_out = this.paused ? this.last_sample : mix_out;
            // Update our last sample register
            this.last_sample = mix_out;
            // Return the mixed sample
            // Just in case there's been an internal error and the output is NaN,
            // we return 0 instead as a last resort
            return isNaN(mix_out) ? 0.0 : mix_out;
        }
        
        process(inputs, outputs, parameters){
            // We don't need to use the inputs or parameters
            // If ouroutputs aren't arrays of arrays of arrays,
            // we shouldn't even bother trying to process any I/O
            // since something is clearly wrong or not ready yet
            if (!outputs        ) return;
            if (!(outputs[0])   ) return;
            if (!(outputs[0][0])) return;
            // If our mixing mode is set to none, we just output whatever
            // the current playback cursor is pointing at and increase it without
            // going over the buffer length
            if (this.buffer_mixing_mode == "none"){
                for (let i = 0; i < outputs[0][0].length; i++){
                    let out = this.cur_buf[this.cur_buf_cursor];
                    this.cur_buf_cursor = Math.min(this.cur_buf_cursor + 1, this.buffer_size - 1);
                    for (let j = 0; j < outputs.length; j++){
                        for (let k = 0; k < outputs[j].length; k++){
                            outputs[j][k][i] = out;
                        }
                    }
                }
                // We don't want to go into the fade mixing code
                return true;
            }
            else if (this.buffer_mixing_mode == "fade"){
                // We assume the buffers for each channel of each output node are the same length
                for (let i = 0; i < outputs[0][0].length; i++){
                    let mix_out = this.exec_fade_sample();
                    // Output the sample to every channel of every output node
                    for (let j = 0; j < outputs.length; j++){
                        for (let k = 0; k < outputs[0].length; k++){
                            outputs[j][k][i] = mix_out;
                        }
                    }
                }
                // Inform our node the operation was completed successfully
                return true;
            }
            // Mode not recognized
            return false;
        }
    }
    // Actually register us to the context
    registerProcessor("AudioFader", AudioFader);
}
catch (e){}
