// DOCS:
// https://www.nesdev.org/wiki/PPU
// I've sprinkled in some links to it in relevant parts
// of the code

class PPU{
    static VBLANK_POS    = 7;
    static SPRITEHIT_POS = 6;
    static OVERFLOW_POS  = 5;
    // How much an emphasized color gains in brightness
    // (and for that matter, how much a non-emphasized one looses)
    // I'm not sure if the emphasis should be additive or multiplicative
    // but I'm pretty sure it's additive
    static EMPH_FACT     = 1.25;

    constructor(p_nes){
        this.nes          = p_nes;
        this.reg_ctrl     = 0x00;
        this.reg_mask     = 0x00;
        this.reg_status   = 0xA0;
        this.oam_addr     = 0x00;
        // See wiki for explanation of these names
        // Keep in mind that while these 2 registers are
        // 15 bit, the lowest 12 bits are the only ones
        // actually used for data addressing, since they
        // are the only ones needed. The highest 3 bits
        // are used for the fine Y scroll and are masked out
        // when trying to access data in the BG evaluation phase
        this.reg_t        = 0x0000;
        this.reg_v        = 0x0000;
        this.fine_x       = 0x0;
        // Used for determining write state (first or second write)
        // of PPU_SCROLL and PPU_ADDR. It is shared by those two registers.
        // Cleared upon reading PPU_STATUS
        this.latch_w      = 0;
        // Read buffer for 0x2007 reads
        this.read_buffer   = 0x00;
        // Used to keep track of which scanline we are rendering
        this.scan_index   = 0;
        // Yet another address space (it is unspecified
        // how it is upon power-on/reset, so we can just
        // stick with the default of all 0x00)
        this.oam          = new Uint8Array(256);
        this.sec_oam      = new Uint8Array( 32);
        // Used for keeping track on the PPU's frame rendering stage
        this.dot_group    = 0;
        // It has to be initialized in a separate function call
        this.palette      = [];
        // Since sprites are drawn one scanline delayed, we need a buffer
        // of the previous scanline's sprite evaluation to be displayed
        // on thr current scanline
        this.prev_spr_buf = { buf: new Uint8Array(256), sprz: new Uint8Array(256) };
        this.img_buf      = new Uint8Array(       256 * 240 * 4);
        this.out_buf      = new Uint8ClampedArray(256 * 240 * 4);
    }

    set_status(pos, val){
        // Explanation of why this works in cpu.js set_flag()
        let flag_bit = (!!val) << pos;
        let base = (~(1 << pos)) & this.reg_status;
        this.reg_status = base | flag_bit;
    }

    set_ctrl(val){
        this.reg_ctrl = val;
        this.reg_t = (this.reg_t & 0x73FF) | ((val & 0x03) << 10);
        if ((this.reg_status & (1 << PPU.VBLANK_POS)) && (this.reg_ctrl & 0x80)){
            // It says on the wiki this happens but I'm not sure
            // if this will totally work because my emulator is not
            // 100% cycle accurate
            this.nes.cpu.req_nmi = true;
        }
    }

    set_mask(val){
        this.reg_mask = val;
    }

    get_status(){
        // Normally the first 5 bits of PPU_STATUS would return stale
        // bus contents, but since no program should use that, we should
        // be able to just return zeroes
        let tmp = this.reg_status;
        // Reading PPU_STATUS clears VBLANK flag after the read (I think)
        this.set_status(PPU.VBLANK_POS, 0);
        // Reading PPU_STATUS resets the latch
        this.latch_w = 0;
        return tmp;
    }

    set_oam_addr(val){
        this.oam_addr = val;
    }

    // Apparently OAM_DATA is scuffed as hell and causes stuff to corrupt,
    // graphical glitches, etc... So, I'll implement it but most programs
    // shouldn't use it, since OAM_DMA should be used (I also won't implement its jank lol)
    // Reading it doesn't seem to do much, but writing to it seems like hell on Earth
    get_oam_data(){
        return this.oam[this.oam_addr];
    }
    
    set_oam_data(val){
        this.oam[this.oam_addr] = val;
        // THIS right here is what seems to cause all the jank
        this.oam_addr = (this.oam_addr + 1) & 0xFF;
    }

    set_scroll(val){
        if (this.latch_w){
            this.reg_t = (this.reg_t & 0x0C1F)
                           | ((val & 0xF8) <<  2)
                           | ((val & 0x07) << 12);
            // After second write, the latch resets
            // to first write behaviour
            this.latch_w = 0;
        }
        else{
            this.reg_t = (this.reg_t & 0x7FE0) | ((val & 0xF8) >>> 3);
            this.fine_x = val & 0x07;
            this.latch_w = 1;
        }
    }

    set_addr(val){
        if (this.latch_w){
            this.reg_t = (this.reg_t & 0x7F00) | val;
            this.reg_v =  this.reg_t;
            // Same as before with the latch
            this.latch_w = 0;
        }
        else{
            // Most significant bit is cleared
            this.reg_t = (this.reg_t & 0x00FF) | ((val & 0x3F) << 8);
            this.latch_w = 1;
        }
    }

    get_data(){
        // Only first 14 bits needed for internal PPU VRAM addressing
        let addr = this.reg_v & 0x3FFF;
        // PPU 0x2007 reads behaviour:
        // - Return contents of read buffer
        // - Set read buffer to contents of VRAM at V
        // - Increment V by 1 or 32 depending on flag at REG_CTRL
        // If reading V would result in a palette read:
        // - Return contents of read
        // - Update read buffer to contents of V - 0x1000
        // - Increment V by 1 or 32 depending on flag at REG_CTRL
        let pal_read = addr >= 0x3F00;
        let tmp = pal_read ? this.nes.mmap.ppu_get_byte(addr) : this.ppu_read_buffer;
        this.read_buffer = this.nes.mmap.ppu_get_byte(pal_read ? (addr - 0x1000) : addr);
        // Pretty sure the 15th bit can be affected by the VRAM access increase
        this.reg_v = (this.reg_v + ((this.reg_ctrl & 0x04) ? 32 : 1)) & 0x7FFF;
        return tmp;
    }
    
    set_data(val){
        // See above for similar notes
        this.nes.mmap.ppu_set_byte(this.reg_v & 0x3FFF, val);
        this.reg_v = (this.reg_v + ((this.reg_ctrl & 0x04) ? 32 : 1)) & 0x7FFF;
    }

    oam_dma(val){
        // This paralyzes the CPU for 513 cycles (there is a small subtlety
        // of 1 cycle but for the purposes of this emulator it doesn't really matter)
        val <<= 8;
        for (let i = 0; i < 0x0100; i++){
            this.oam[(this.oam_addr + i) & 0xFF] = this.nes.mmap.get_byte(val | i);
        }
        // I know it's kinda weird that the PPU and CPU sort of directly interact
        // here, without MMAP as an intermediary, but it is what it is, it's the
        // easiest way to do it
        this.nes.cpu_wait_cycles += 513;
    }

    load_normal_palette(){
        // Copied from a comment in
        // https://lospec.com/pdlette-list/nintendo-entertainment-system
        // And formatted this way to make it easier to put into our image buffer
        this.palette = [
            [0x58, 0x58, 0x58], [0x00, 0x23, 0x7C], [0x0D, 0x10, 0x99], [0x30, 0x00, 0x92], [0x4F, 0x00, 0x6C], [0x60, 0x00, 0x35], [0x5C, 0x05, 0x00], [0x46, 0x18, 0x00],
            [0x27, 0x2D, 0x00], [0x09, 0x3E, 0x00], [0x00, 0x45, 0x00], [0x00, 0x41, 0x06], [0x00, 0x35, 0x45], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00],
            [0xA1, 0xA1, 0xA1], [0x0B, 0x53, 0xD7], [0x33, 0x37, 0xFE], [0x66, 0x21, 0xF7], [0x95, 0x15, 0xBE], [0xAC, 0x16, 0x6E], [0xA6, 0x27, 0x21], [0x86, 0x43, 0x00],
            [0x59, 0x62, 0x00], [0x2D, 0x7A, 0x00], [0x0C, 0x85, 0x00], [0x00, 0x7F, 0x2A], [0x00, 0x6D, 0x85], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00],
            [0xFF, 0xFF, 0xFF], [0x51, 0xA5, 0xFE], [0x80, 0x84, 0xFE], [0xBC, 0x6A, 0xFE], [0xF1, 0x5B, 0xFE], [0xFE, 0x5E, 0xC4], [0xFE, 0x72, 0x69], [0xE1, 0x93, 0x21],
            [0xAD, 0xB6, 0x00], [0x79, 0xD3, 0x00], [0x51, 0xDF, 0x21], [0x3A, 0xD9, 0x74], [0x39, 0xC3, 0xDF], [0x42, 0x42, 0x42], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00],
            [0xFF, 0xFF, 0xFF], [0xB5, 0xD9, 0xFE], [0xCA, 0xCA, 0xFE], [0xE3, 0xBE, 0xFE], [0xF9, 0xB8, 0xFE], [0xFE, 0xBA, 0xE7], [0xFE, 0xC3, 0xBC], [0xF4, 0xD1, 0x99],
            [0xDE, 0xE0, 0x86], [0xC6, 0xEC, 0x87], [0xB2, 0xF2, 0x9D], [0xA7, 0xF0, 0xC3], [0xA8, 0xE7, 0xF0], [0xAC, 0xAC, 0xAC], [0x00, 0x00, 0x00], [0x00, 0x00, 0x00],
        ];
    }

    init_buffer(){
        for (let i = 0; i < this.img_buf.length; i += 4){
            this.img_buf[i + 0] = 0x00;
            this.img_buf[i + 1] = 0x00;
            this.img_buf[i + 2] = 0x00;
            this.img_buf[i + 3] = 0xFF;
        }
    }
    
    put_pixel(x, y, c){
        let i = ((y << 8) + x) * 4;
        this.img_buf[i + 0] = c[0];
        this.img_buf[i + 1] = c[1];
        this.img_buf[i + 2] = c[2];
        // No need to set alpha, it's always 0xFF and has been initialized
        // in the init_buffer() function
    }

    update_out_buf(){
        for (let i = 0; i < this.img_buf.length; i++){
            this.out_buf[i] = this.img_buf[i];
        }
    }
    
    // These two functions are taken directly from the NesDev wiki
    // https://www.nesdev.org/wiki/PPU_s-crolling
    // Check there to see why this works
    coarse_x_inc(){
        if ((this.reg_v & 0x001F) == 0x1F){
            this.reg_v &= 0xFFE0;
            this.reg_v ^= 0x0400;
        }
        else this.reg_v++;
    }

    y_inc(){
        if ((this.reg_v & 0x7000) < 0x7000) this.reg_v += 0x1000;
        else{
            this.reg_v &= 0x0FFF;
            let y = (this.reg_v & 0x03E0) >> 5;
            if (y == 29){
                y = 0;
                this.reg_v ^= 0x0800;
            }
            else if (y == 31) y = 0;
            else y++;
            this.reg_v = (this.reg_v & 0x7C1F) | (y << 5);
        }
    }

    spr_in_scanline(y, scan_index, spr_size){
        return (y <= scan_index) && (y >= Math.max(scan_index - spr_size + 1, 0));
    }

    // Returns a scanline buffer for the sprites in the current scanline
    // and an array indicating which pixels of the scanline contain an opaque
    // pixel belonging to the sprite index 0
    sprite_scanline(scan_index){
        this.sec_oam        = new Uint8Array(32);
        let spr_size        = (this.reg_ctrl & 0x20) ? 16 : 8;
        let sprite_counter  = 0;
        // Index in the secondary OAM of the sprite index 0 in the OAM
        let sprz_index      = -1;
        // Sprite overflow flag has a weird bug, read more about it here:
        // https://www.nesdev.org/wiki/PPU_sprite_evaluation
        let spro_bug_offset = 0;
        for (let i = 0; i < 256; i += 4){
            if (sprite_counter == 32){
                let spr_y = this.oam[i + spro_bug_offset];
                if (this.spr_in_scanline(spr_y, scan_index, spr_size)){
                    this.set_status(PPU.OVERFLOW_POS, 1);
                }
                spro_bug_offset = (spro_bug_offset + 1) % 4;
                // We don't go to the logic for adding sprites to the secondary OAM
                // if we already fully filled it
                continue;
            }
            if (this.spr_in_scanline(this.oam[i], scan_index, spr_size)){
                for (let j = 0; j < 4; j++) this.sec_oam[sprite_counter + j] = this.oam[i + j];
                if (i == 0) sprz_index = sprite_counter;
                sprite_counter += 4;
            }
        }
        // This is where the sprite buffer output will be stored
        // Each byte has the format
        // TPCCCCCC
        // T = Transparency bit (1 = opaque, 0 = transparent)
        // P = Priority bit
        // C = Palette color
        let buffer      = new Uint8Array(256);
        let sprz_pixels = new Uint8Array(256);
        // Base pattern table address
        let base_pt   = (this.reg_ctrl & 0x08) << 9;
        // Making i increase by 4 saves so many multiplications
        for (let i = 0; i < sprite_counter; i += 4){
            // Specifies the strip of the sprite which will be
            // drawn on the scanline as an offset from the base
            // pattern table address
            let spr_offset = scan_index - this.sec_oam[i];
            // Vertical sprite flip
            if (this.sec_oam[i+2] & 0x80) spr_offset = spr_size - spr_offset - 1;
            // For a more detailed explanation of pattern table fetching for OAM
            // sprites, see the wiki page:
            // https://www.nesdev.org/wiki/PPU_OAM#Byte_1
            let spr_pt = (spr_size == 8)
                       ? (((this.reg_ctrl     & 0x08) <<  9) |  (this.sec_oam[i+1]         << 4) | spr_offset)
                       : (((this.sec_oam[i+1] & 0x01) << 12) | ((this.sec_oam[i+1] & 0xFE) << 5) | spr_offset);
            // Low byte of sprite color
            let spr_low    =  this.nes.mmap.ppu_get_byte(spr_pt    );
            // High byte of sprite color
            let spr_high   =  this.nes.mmap.ppu_get_byte(spr_pt + 8);
            // Palette number of the sprite
            let pal        = (this.sec_oam[i+2] & 0x03) + 4;
            // Saves a handful of operations and makes the code more readable
            let hor_flip   =  this.sec_oam[i+2] & 0x40;
            for (let j = 0; j < 8; j++){
                // Current bit of high and low plane we are reading
                // Also here we handle the horizontal flip logic
                let cur_bit = 1 << (hor_flip ? j : (7 - j));
                let color   = ((!!(spr_high & cur_bit)) << 1) | (!!(spr_low & cur_bit));
                // We only fill the buffer pixel if its transparent, otherwise
                // keep what was already there
                if (buffer[this.sec_oam[i+3]+j] & 0x80) continue;
                // Start from the base palette address (0x3F00)
                // and simply add the final color output to get
                // the color index
                let col_i = (pal << 2) | color;
                // There is an exception that 0x3F04, 0x3F08, 0x3F0C
                // are replaced with 0x3F00, because they aren't actual
                // mirrors, the can contain their own values, but they
                // aren't normally used except with a hardware bug
                let palette_color = this.nes.mmap.ppu_get_byte(0x3F00 | (color ? col_i : 0x00));
                if ((i == sprz_index) && color) sprz_pixels[this.sec_oam[i+3]+j] = 0x01;
                buffer[this.sec_oam[i+3]+j] = ((!!color)<<7) | ((this.sec_oam[i+2] & 0x20)<<1) | palette_color;
            }
        }
        // Mask leftmost 8 pixels if corresponding flag is set
        // I'm not sure if PPU MASK is modified in the middle of rendering, the
        // sprites should hide immediatly or be 1 scanline delayed, but that
        // situation doesn't really affect functionality and should NEVER happen anyways
        if (!(this.reg_mask & 0x04)){
            // Not really sure what color to pick for this, so I'll
            // just go with a random black
            for (let i = 0; i < 8; i++){
                buffer[i] = 0x0F;
                sprz_pixels[i] = 0x00;
            }
        }
        return { buf: buffer, sprz: sprz_pixels };
    }

    bg_scanline(){
        // This buffer doesn't need a priority bit,
        // so the format will be
        // TUCCCCCC
        // T = Transparency bit
        // U = Unused (0)
        // C = Palette color
        let buffer  = new Uint8Array(256);
        let pt_addr = ((this.reg_ctrl & 0x10) << 8) | (this.nes.mmap.ppu_get_byte(0x2000 | (this.reg_v & 0x0FFF)) << 4);
        let fine_y  =  (this.reg_v & 0x7000) >>> 12;
        let bg_low  =   this.nes.mmap.ppu_get_byte(pt_addr + fine_y    );
        let bg_high =   this.nes.mmap.ppu_get_byte(pt_addr + fine_y + 8);
        for (let i = 0; i < 256; i++){
            let cur_bit   = 1 << (7 - this.fine_x);
            let color     = ((!!(bg_high & cur_bit)) << 1) | (!!(bg_low & cur_bit));
            // It's pretty complicated how these AT mapping bitwise magic fomulas
            // actually work, but if you think about it, it will make sense
            // See NesDev wiki for more info
            // https://www.nesdev.org/wiki/PPU_attribute_tables
            // AT address formula taken directly from NesDev wiki
            // https://www.nesdev.org/wiki/PPU_scrolling
            let at_addr   = 0x23C0                    // Base AT address
                        |  (this.reg_v & 0x0C00)      // NT select
                        | ((this.reg_v >> 4) & 0x38)  // High AT index bits
                        | ((this.reg_v >> 2) & 0x07); // Low AT index bits
            let at_sector = ((this.reg_v & 0x08) >>> 2) // Top (0) / Bottom (1) bit
                           | (this.reg_v & 0x01);       // Left (0) / Right (1) bit
            let at_group  = this.nes.mmap.ppu_get_byte(at_addr);
            let pal       = null;
            // It's easier just to hardcode this part
            if      (at_sector == 0x00){
                pal = (at_group & 0x03) >>> 0;
            }
            else if (at_sector == 0x01){
                pal = (at_group & 0x0C) >>> 2;
            }
            else if (at_sector == 0x02){
                pal = (at_group & 0x30) >>> 4;
            }
            else if (at_sector == 0x03){
                pal = (at_group & 0xC0) >>> 6;
            }
            // Explained above, in sprite_scanline()
            if (!color) pal = 0x00;
            buffer[i] = ((!!color)<<7) | this.nes.mmap.ppu_get_byte(0x3F00 | (pal << 2) | color);
            // X increment
            if (this.fine_x < 7) this.fine_x++;
            else{
                this.fine_x = 0;
                this.coarse_x_inc();
                // Re-fetch NT/PT data (we only do it here because they
                // don't change until there is a change in coarse X)
                pt_addr = ((this.reg_ctrl & 0x10) << 8) | (this.nes.mmap.ppu_get_byte(0x2000 | (this.reg_v & 0x0FFF)) << 4);
                fine_y  =  (this.reg_v & 0x7000) >>> 12;
                bg_low  =   this.nes.mmap.ppu_get_byte(pt_addr + fine_y    );
                bg_high =   this.nes.mmap.ppu_get_byte(pt_addr + fine_y + 8);
            }
        }
        // Mask leftmost 8 pixels if corresponding flag is set
        if (!(this.reg_mask & 0x02)){
            // Explained above, in sprite_scanline()
            for (let i = 0; i < 8; i++) buffer[i] = 0x0F;
        }
        return buffer;
    }

    calc_scan_index(){
        // Here we are basically doing some bitwise magic
        // to get two numbers, one from T and one from V
        // which specify their Y components in the format
        // YYYYYyyy
        // Y = coarse Y
        // y = fine Y
        // and then subtracting them while also keeping in
        // mind the vertical NT position
        let t_y = ((this.reg_t & 0x03E0) >>>  2) | ((this.reg_t & 0x7000) >>> 12);
        let v_y = ((this.reg_v & 0x03E0) >>>  2) | ((this.reg_v & 0x7000) >>> 12);
        v_y += ((this.reg_v & 0x0800) ^ (this.reg_t & 0x0800)) ? 240 : 0;
        return v_y - t_y;
    }

    render_scanline(){
        let scan_index = this.calc_scan_index();
        // If rendering is disabled, we don't even perform accesses to the VRAM
        let spr_buf    = { buf: new Uint8Array(256), sprz: new Uint8Array(256) };
        let bg_buf     = new Uint8Array(256);
        // Only if either of the show flags are set do we perform our VRAM our OAM accesses
        // and then mask out whichever parts we shouldn't show
        if (this.reg_mask & 0x18){
            spr_buf = this.sprite_scanline(scan_index);
            bg_buf  = this.bg_scanline();
        }
        // Apply mux priority table to choose which pixel to keep
        // between the two buffers
        // +-----+-----+----------+-----+
        // | BG  | SPR | PRIORITY | OUT |
        // +-----+-----+----------+-----+
        // |  0  |  0  |    X     |  0  |
        // |  0  | 1-3 |    X     | SPR |
        // | 1-3 |  0  |    X     | BG  |
        // | 1-3 | 1-3 |    0     | SPR |
        // | 1-3 | 1-3 |    1     | BG  |
        // +-----+-----+----------+-----+
        let mux_buf        = new Uint8Array(256);
        // If either BG or sprites are masked, we fill the
        // mux buffer with the other one
        if      (!(this.reg_mask & 0x08)) mux_buf = this.prev_spr_buf.buf;
        else if (!(this.reg_mask & 0x10)) mux_buf = bg_buf;
        // Otherwise we apply the mux priority table
        else{
            for (let i = 0; i < 256; i++){
                if      (!(this.prev_spr_buf.buf[i] & 0x80)) mux_buf[i] = bg_buf[i];
                else if (!(bg_buf[i]                & 0x80)) mux_buf[i] = this.prev_spr_buf.buf[i];
                else if (  this.prev_spr_buf.buf[i] & 0x40 ) mux_buf[i] = bg_buf[i];
                else                                         mux_buf[i] = this.prev_spr_buf.buf[i];
            }
            // Calculate if we should set sprite-hit-0 flag
            // We don't check for sprite-hit-0 at pixel 255 because
            // it's actually a bug in the PPU that the sprite-hit-0
            // flag cannot be set at pixel 255 for an obscure reason having
            // to do with the pixel pipeline
            for (let i = 0; i < 255; i++){
                if (spr_buf.sprz[i] && (bg_buf[i] & 0x80)){
                    this.set_status(PPU.SPRITEHIT_POS, 1);
                    break;
                }
            }
        }
        // Now is a good a time as any to move our current scanline's sprite
        // buffer to the buffer which will be displayed on the next scanline
        this.prev_spr_buf = spr_buf;
        // Finally display scanline output
        for (let i = 0; i < 256; i++){
            // We don't want to keep accessing mux_buf[i],
            // so we'll just save it here
            // We have to mask out the transparency and
            // priority we saved in the buffers
            let col_i = mux_buf[i] & 0x3F;
            if (this.reg_mask & 0x01) col_i &= 0x30;
            // Color to be displayed in RGB format
            let raw_c = [];
            // We have to declare raw_c like this because otherwise we will
            // modify the actual palette color, not the copy of the color in raw_c
            raw_c[0] = this.palette[col_i][0];
            raw_c[1] = this.palette[col_i][1];
            raw_c[2] = this.palette[col_i][2];
            // Color emphasis only applied to color with low nibble 0-D,
            // that is to say, every color except blacks (with 0x0D and
            // 0x1D blacks being the exception, theyre evil)
            if ((col_i & 0x0F) < 0x0E){
                // Apply color emphasis
                // Red emphasis
                if (this.reg_mask & 0x20){
                    raw_c[0] = Math.min(raw_c[0] * PPU.EMPH_FACT, 0xFF);
                    raw_c[1] = Math.max(raw_c[1] / PPU.EMPH_FACT, 0x00);
                    raw_c[2] = Math.max(raw_c[2] / PPU.EMPH_FACT, 0x00);
                }
                // Green emphasis
                if (this.reg_mask & 0x40){
                    raw_c[0] = Math.max(raw_c[0] / PPU.EMPH_FACT, 0x00);
                    raw_c[1] = Math.min(raw_c[1] * PPU.EMPH_FACT, 0xFF);
                    raw_c[2] = Math.max(raw_c[2] / PPU.EMPH_FACT, 0x00);
                }
                // Blue emphasis
                if (this.reg_mask & 0x80){
                    raw_c[0] = Math.max(raw_c[0] / PPU.EMPH_FACT, 0x00);
                    raw_c[1] = Math.max(raw_c[1] / PPU.EMPH_FACT, 0x00);
                    raw_c[2] = Math.min(raw_c[2] * PPU.EMPH_FACT, 0xFF);
                }
            }
            this.put_pixel(i, scan_index, raw_c);
        }
        // These 2 lines are verbose what happens after the scanline
        // has been rendered
        this.y_inc();
        // Set horizontal component of V to horizontal component of T
        this.reg_v = (this.reg_v & 0x7BE0) | (this.reg_t & 0x041F);
        // Fine X should have stayed the same after rendering the scanline
        // since we do 256 increments of it and always reset it once it
        // reaches 8
    }

    exec_dot_group(){
        // First 240 dot groups render a scanline each
        if      (this.dot_group <= 239) this.render_scanline();
        // We do nothing in the post-render scanline, it's just idle,
        // but in the case of our emulator, we can use it to copy the
        // image buffer to the actual output buffer and keep the FPS metric
        // up to date
        else if (this.dot_group == 240){
            this.update_out_buf();
            this.nes.count_frame();
        }
        // Start of VBlank period
        else if (this.dot_group == 241){
            this.set_status(PPU.VBLANK_POS, 1);
            if (this.reg_ctrl & 0x80) this.nes.cpu.req_nmi = true;
        }
        // Dot groups 242 - 260 are the idle VBlank period
        else if (this.dot_group <= 260) {}
        else if (this.dot_group >= 261){
            // End of VBlank period
            this.set_status(PPU.VBLANK_POS   , 0);
            // Other flags are reset too
            this.set_status(PPU.SPRITEHIT_POS, 0);
            this.set_status(PPU.OVERFLOW_POS , 0);
            // Reset v back to t
            this.reg_v = this.reg_t;
            // Reset dot group
            this.dot_group = 0;
            // Return here to not increase dot group in the later line
            return 341;
        }
        // Always increment dot group
        this.dot_group++;
        // Amount of dots per dot group
        return 341;
    }
}
