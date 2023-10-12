// DOCS:
// As a pointer, just use this:
// https://www.nesdev.org/wiki/APU
// Also, a nice technical document for the APU:
// https://www.nesdev.org/apu_ref.txt

class APU{
    static SAMPLE_RATE = 44100.0;
    // I don't know if this is going to be great for performance, but
    // the length of the buffer is going to be a full-frame, which
    // means it's going to be reloaded at 60Hz, which I think should be
    // a nice balance between performance and quality
    static BUF_SIZE  = Math.round(44100.0 / 60.0);
    // Determines how many APU cycles the linear feedback shift register
    // has to wait until the next shift, dictated by the period flag
    static LFSR_SHIFT_PERIODS = [
           4,
           8,
          16,
          32,
          64,
          96,
         128,
         160,
         202,
         254,
         380,
         508,
         762,
        1016,
        2034,
        4068,
    ];

    // The APU has 5 channels: two square wave channels, one triangle wave channel,
    // one noise channel, and one DMC (Delta Modulation Channel) channel
    constructor(nes){
        this.nes                  = nes;
        // APU registers are pretty complex and most of them
        // perform multiple functions, so my nomenclature for them
        // won't be the best, as such, I'll put here above their
        // declarations a shoft list with all their functions
        // Duty, halt/envelope loop, constant/envelope, envelope divider period
        this.square1_ctrl         = 0x00;
        this.square2_ctrl         = 0x00;
        // Enable, period, negate, shift
        this.square1_sweep        = 0x00;
        this.square2_sweep        = 0x00;
        // Timer low
        this.square1_timer        = 0x000;
        this.square2_timer        = 0x000;
        // Length, timer high
        this.square1_length       = 0x00;
        this.square2_length       = 0x00;
        // Control flag/halt, counter reload
        this.tri_linear           = 0x00;
        // Timer low
        this.tri_timer            = 0x000;
        // Length, timer high
        this.tri_length           = 0x00;
        // Internal triangle wave registers not directly exposed to the CPU
        // Linear counter reload flag
        // Is set as a side effect of writing to tri_length
        this.tri_reload           = 0x00;
        // The current value of our linear counter
        this.tri_cur_linear       = 0x00;
        // The current value of the timer divider
        this.tri_cur_timer        = 0x000;
        // The current phase of the triangle wave to be
        // used when calculating it's output for a sample
        this.tri_cur_phase        = 0x00;
        // Halt/envelope loop, constant/envelope, envelope divider period
        this.noise_ctrl           = 0x00;
        // Mode, period
        this.noise_period         = 0x00;
        // Length, envelope restart (write)
        this.noise_length         = 0x00;
        // A 15-bit linear shift feedback register used internally
        // to generate the noise for the noise channel
        // Starts at value 0x0001 (see docs)
        // https://www.nesdev.org/wiki/APU_Noise
        this.noise_lfsr           = 0x0001;
        // Tracks the amount of APU cycles until the next noise
        // shift register shift
        // Starts at 4 because all registers start at 0, to the
        // period register indicates the first entry of our table
        // and to save time, we can just write 4
        this.noise_shift_wait     = 4;
        // Controls whether each channel is silenced (0) or not (1)
        // Format: ---D NT21
        // D: DMC
        // N: Noise
        // T: Triangle
        // 2: Square 2
        // 1: Square 1
        this.ctrl                 = 0x00;
        // Outputs a 240Hz signal for quarter-frames
        // by counting up and sending the signal every (approx.) 3729 cycles
        // Resets once one full frame has been completed (14915 cycles, 60Hz aprox.)
        // Used for length counters, linear counters, sweep units, envelopes
        // and the frame IRQ
        this.frame_counter        = 0;
        this.frame_counter_status = 0x00;
        // Envelope unit registers/flags
        // I recommend refreshing up on it by reading the docs if you
        // aren't exactly sure what these do:
        // https://www.nesdev.org/wiki/APU_Envelope
        // The APU has 3 envelope units, so we basically have to create
        // 3 copies of every internal register
        // Each envelope unit is for a different channel (square 1, square 2, noise)
        // The envelope loop and constant volume flags are kept in the control
        // registers of each channel, alongside some other flags
        this.sq1_env_start        = 0x00;
        this.sq2_env_start        = 0x00;
        this.noise_env_start      = 0x00;
        this.sq1_env_divider      = 0;
        this.sq2_env_divider      = 0;
        this.noise_env_divider    = 0;
        this.sq1_env_decay        = 0x00;
        this.sq2_env_decay        = 0x00;
        this.noise_env_decay      = 0x00;
        // The AudioBuffer in which we will be storing our sound output
        this.buffer               = null;
        // The raw Float32Array of samples
        this.raw_buffer           = null;
        // Since we recieve exec_cycle calls at 894.887KHz, we need to somehow
        // convert our APU clock into a 44.1KHz clock, kind of like the frame
        // counter does (in the actual APU it's called the divider)
        // For every (approx.) sample, we need to recieve 20 cycles
        this.sample_counter       = 0.0;
        // Keeps track of which sample we are going to write in the put_sample() function
        this.sample_pos           = 0;
        // Defines the global volume for the whole APU
        // Should be able to be modified by the user in the future
        this.volume               = 0.20;
        // Used to coordinate with the NES when a quarter frame has passed
        // and we can play the updated audio buffer (should only come into
        // play in REALLY slow devices)
        this.req_play             = false;
        // The NES has both a high and low pass filter, so, we implement those by
        // adding 2 layers of biquad filters (despite how interesting it may be
        // to implement it myself, it would probably be very time consuming and
        // not as fast as the Web Audio API)
        this.low_pass             = null;
        this.high_pass            = null;
        // To make the audio playback as smooth as possible, we keep the last
        // buffer playing until we are ready to play the next one, and then we
        // stop it, to keep a continuous stream of audio coming to the user
        this.last_src             = null;
        // Initialized in init_sound()
        this.ctx                  = null;
    }

    to_json(){
        return {
            
        };
    }
    
    from_json(state){
    
    }

    init_sound(){
        this.ctx                       = new (window.AudioContext || window.webkitAudioContext)();
        this.buffer                    = this.ctx.createBuffer(1, APU.BUF_SIZE, APU.SAMPLE_RATE);
        this.raw_buffer                = this.buffer.getChannelData(0);
        this.low_pass                  = this.ctx.createBiquadFilter();
        this.low_pass.type             = "lowpass";
        this.low_pass.frequency.value  = 14_000;
        this.high_pass                 = this.ctx.createBiquadFilter();
        this.high_pass.type            = "highpass";
        // In reality, the NES applies 2 high-pass filters, one at 90Hz
        // and another afterwards at 440Hz, which just effectively results
        // in a 440Hz highpass filter (I think)
        this.high_pass.frequency.value = 440;
        // Audio pipeline:
        //                    loop until next play
        //                          +--+
        //                          v  |
        // raw_buffer -> buffer -> src -> low_pass -> high_pass -> req play -> ctx.destination
        this.low_pass.connect(this.high_pass);
        this.high_pass.connect(this.ctx.destination);
    }

    play_buffer(){
        // Acknowledge our request has been fulfilled by the NES internal loop
        this.req_play = false;
        // Create a new source for our current APU output
        let src = this.ctx.createBufferSource();
        src.buffer = this.buffer;
        src.loop = true;
        src.connect(this.low_pass);
        src.start();
        // Stop and update last source
        // Avoid calling stop() on null the first time we
        // pass through here
        if (this.last_src != null) this.last_src.stop();
        this.last_src = src;
        // For some reason, our raw buffer gets stepped over or reset
        // or deleted or something of the sort everytime we hook up and play
        // our audio buffer, so we need to redefine it every time we play
        // the audio buffer
        this.raw_buffer = this.buffer.getChannelData(0);
    }

    set_tri_linear(val){
        this.tri_linear = val;
    }

    set_tri_timer(val){
        // Sets only the 8 LSB of timer
        this.tri_timer = (this.tri_timer & 0x700) | val;
    }

    set_tri_length(val){
        // Length is set to the 5 MSB, while the
        // 3 LSB are used for the timer high bits
        this.tri_length = val & 0xF8;
        this.tri_timer  = ((val & 0x07) << 8) | (this.tri_timer & 0x0FF);
        this.tri_reload = 0x01;
    }

    // All the setters are kinda bulky, but it is what it is
    // A side-effect of writing to the length counters of any
    // channel with an envelope unit is that it sets that envelope's
    // start flag
    set_noise_ctrl(val){
        this.noise_ctrl = val;
    }

    set_noise_period(val){
        this.noise_period = val;
    }

    set_noise_length(val){
        this.noise_length = val;
        this.noise_env_start = 0x01;
    }
    
    set_ctrl(val){
        this.ctrl = val;
    }

    // Back to actual code
    lfsr_shift(){
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

    calc_tri_out(){
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
        let tnd_denom = (t / 8227.0) + (n / 12241.0) + (d / 22638.0); 
        let tnd_out   = 159.79 / ((1.0 / tnd_denom) + 100.0);
        let p_out     = 95.88 / ((8128.0 / (p1 + p2)) + 100.0);
        // Convert the [0.0, 1.0] range sample that p_out + tnd_out
        // gives us into a [-1.0, 1.0] range sample
        return (2.0 * (p_out + tnd_out)) - 1.0;
    }
    
    put_sample(){
        // All channel's output ranges from 0-15, except for the
        // DMC, which goes from 0-127
        let tri_out   = 0
        let noise_out = 0;
        // Calcute sq1, sq2 and noise if length is not 0 and the control
        // register has the enable flag for the noise channel set
        if ((this.noise_length & 0xF8) && (this.ctrl & 0x08)) noise_out = this.calc_noise_out();
        // Calculate triangle if it's enabled in the control register,
        // and both the length and linear counter are not 0
        if ((this.tri_length & 0xF8) && (this.tri_cur_linear) && (this.ctrl & 0x04)) tri_out = this.calc_tri_out();
        // Returns a sample in the range [-1.0, 1.0]
        let mix_out = this.mix_sample(0, 0, tri_out, noise_out, 0);
        this.raw_buffer[this.sample_pos] = mix_out * this.volume;
        this.sample_pos++;
        // Just in case, I'll reset the sample_pos here too so as to
        // not got out of bounds of our buffer
        if (this.sample_pos >= APU.BUF_SIZE) this.sample_pos = 0;
    }

    // Since the triangle channel's timer is clocked by the CPU's clock,
    // unlike the square channels which are clocked by the APU's clock,
    // we have to rely on the NES internal loop to call this function
    // everytime a CPU cycle occurs for us to clock our triangle timer
    tri_timer_clock(){
        // Clock our phase and reset timer if it's 0
        if (this.tri_cur_timer == 0){
            this.tri_cur_phase = (this.tri_cur_phase + 1) % 32;
            this.tri_cur_timer = ((this.tri_length & 0x07) << 8) | this.tri_timer;
        }
        // Otherwise decrease it
        else this.tri_cur_timer--;
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
                else if (this.sq1_ctrl & 0x20) this.sq1_env_divider = 0x0F;
            }
            // Otherwise just decrease is
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
                else if (this.sq2_ctrl & 0x20) this.sq2_env_divider = 0x0F;
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
                else if (this.noise_ctrl & 0x20) this.noise_env_divider = 0x0F;
            }
            else this.noise_env_divider--;
        }
    }

    half_frame(){
        // Decrease length counters if halt flag is clear and it's not 0
        if (!(this.tri_linear & 0x80)){
            // Triangle length only saves the length counter in the 5 MSB,
            // the 3 MSB are reserved for the timer high bits
            if (this.tri_length & 0xF8) this.tri_length--;
        }
        if (!(this.noise_ctrl & 0x20)){
            // Noise length only saves the length in the 5 MSB, the 3 LSB do nothing
            if (this.noise_length & 0xF8) this.noise_length -= 8;
        }
    }
    
    exec_cycle(){
        // In actuallity, we need 20.292222222... cycles per sample, so 
        // we can just linearly add 1 to our sample counter and subtract
        // 20.29 everytime we add a sample to occassionally skip a cycle call
        // and do 20 instead of 21 to keep the ratio as exact as possible
        if (this.sample_counter >= 20.2922){
            this.put_sample();
            this.sample_counter -= 20.2922;
        }
        // We always increase the sample counter
        this.sample_counter++;
        // LFSR logic
        if (this.noise_shift_wait == 0){
            this.lfsr_shift();
            // Lowest 4 bits denote the period length
            this.noise_shift_wait = APU.LFSR_SHIFT_PERIODS[this.noise_period & 0x0F];
        }
        // We always decrease the LFSR shift wait
        this.noise_shift_wait--;
        // Frame counter logic
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
        else if (this.frame_counter == ((this.frame_counter_status & 0x80) ? 18641 : 14915)){ // Full frame
            // Full-frames execute half-frame and quarter-frame logic as well
            this.half_frame();
            this.quarter_frame();
            // In reality, there's a subtlety of half a real APU cycles (1 CPU cycle)
            // of when the IRQ is requested and when the half-frame in counted, but
            // it really doesn't matter for the purpose of this emulator
            // Only request an IRQ if we are in 4-step mode and the IRQ flag is set
            if ((this.frame_counter_status & 0xC0) == 0x40) this.nes.cpu.req_irq = true;
            // Request a play of our newly filled up audio buffer
            this.req_play = true;
            // I'm not really sure of this, but I think it's better if we reset the sample_pos
            // cursor here than in the put_sample function when it reaches the end of the buffer,
            // even though both methods should theoretically line up
            // I think it's better to reset it here because it's a higher priotity to write to
            // the first samples once we request a play of our buffer in preparation for the next play
            this.sample_pos = 0;
            // Reset frame counter on the last count
            this.frame_counter = 0;
        }
        // We always increase the frame counter
        this.frame_counter++;
    }
}
