// DOCS:
// NesDev wiki lmao

class PPU{
    static VBLANK_POS    = 7;
    static SPRITEHIT_POS = 6;
    static OVERFLOW_POS  = 5;

    constructor(p_nes, p_ctx, p_px_size){
        this.nes = p_nes;
        this.reg_ctrl   = 0x00;
        this.reg_mask   = 0x00;
        this.reg_status = 0xA0;
        this.oam_addr   = 0x00;
        // See wiki for explanation of these names
        // Keep in mind that while these 2 registers are
        // 15 bit, the lowest 12 bits are the only ones
        // actually used for data addressing, since they
        // are the only ones needed. The highest 3 bits
        // are used for the fine Y scroll and are masked out
        // when trying to access data
        this.reg_addr_t = 0x0000;
        this.reg_addr_v = 0x0000;
        this.reg_fine_x = 0x0;
        // Used for determining write state (first or second write)
        // of PPU_SCROLL and PPU_ADDR. It is shared by those two registers.
        // Cleared upon reading PPU_STATUS
        this.latch_w    = 0;
        // Used to keep track of which scanline we are rendering
        this.scan_index = 0;
        // Yet another address space (it is unspecified
        // how it is upon power-on/reset, so we can just
        // stick with the default of all 0x00)
        this.oam        = new Uint8Array(256);
        this.sec_oam    = new Uint8Array( 32);
        // It has to be initialized in a separate function call
        this.palette    = [];
        this.ctx        = p_ctx;
        this.px_size    = p_px_size;
    }

    set_status(pos, val){
        // Explanation of why this works in cpu.js set_flag()
        let flag_bit = (!!val) << pos;
        let base = (~(1 << pos)) & this.reg_status;
        this.reg_status = base | flag_bit;
    }

    set_reg_ctrl(val){
        this.reg_ctrl = val;
        this.reg_addr_t = (this.reg_addr_t & 0b1110011_11111111) | ((val & 0x03) << 10);
        if ((this.reg_status & 0x80) && (this.reg_ctrl & 0x80)){
            // It says on the wiki this happens but I'm not sure
            // if this will totally work because my emulator is not
            // 100% cycle accurate
            //this.nes.cpu.nmi();
        }
    }

    set_reg_mask(val){
        this.reg_mask = val;
    }

    get_reg_status(){
        // Normally the first 5 bits of PPU_STATUS would return stale
        // bus contents, but since no program should use that, we should
        // be able to just return zeroes
        let tmp = this.reg_status;
        // Reading PPU_STATUS clear VBLANK flag after the read (I think)
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

    set_reg_scroll(val){
        if (this.latch_w){
            this.reg_addr_t = (this.reg_addr_t & 0b0001100_00011111)
                           | ((val & 0b11111000) <<  2)
                           | ((val & 0b00000111) << 12);
            // After second write, the latch resets
            // to first write behaviour
            this.latch_w = 0;
        }
        else{
            this.reg_addr_t = (this.reg_addr_t & 0b1111111_11100000) | ((val & 0b11111000) >>> 3);
            this.reg_fine_x = val & 0x07;
            this.latch_w = 1;
        }
    }

    set_reg_addr(val){
        if (this.latch){
            this.reg_addr_t = (this.reg_addr_t & 0b1111111_00000000) | val;
            this.reg_addr_v =  this.reg_addr_t;
            // Same as before with the latch
            this.latch_w = 0;
        }
        else{
            // Most significant bit is cleared
            this.reg_addr_t = (this.reg_addr_t & 0b0000000_11111111) | ((val & 0b00111111) << 9);
            this.latch_w = 1;
        }
    }

    get_reg_data(mod){
        let tmp = this.nes.mmap.ppu_get_byte(this.reg_addr_v);
        // For debugging purposes, we add the option for reading
        // REG_DATA to not change the internal state
        if (mod) this.reg_addr_v += (this.reg_ctrl & 0x04) ? 32 : 1;
        return tmp;
    }

    set_reg_data(val){
        debug_log("PPU_DATA write: " +  hx_fmt(val));
        this.nes.mmap.ppu_set_byte(this.reg_addr_v, val);
        this.reg_addr_v += (this.reg_ctrl & 0x04) ? 32 : 1;
    }

    set_oam_dma(val){
        // This paralyzes the CPU for 513 cycles (there is a small subtlety
        // of 1 cycle but for the purposes of this emulator it doesn't really
        // matter)
        //!! TO BE IMPLEMENTED
        val = val << 8;
        for (let i = 0; i < 0x0100; i++){
            this.oam[i] = this.nes.mmap.get_byte(val | i);
        }
    }

    load_normal_palette(){
        // Copied from a comment in
        // https://lospec.com/palette-list/nintendo-entertainment-system
        this.palette = ["#585858", "#00237C", "#0D1099", "#300092", "#4F006C", "#600035", "#5C0500", "#461800",
                        "#272D00", "#093E00", "#004500", "#004106", "#003545", "#000000", "#000000", "#000000",
                        "#A1A1A1", "#0B53D7", "#3337FE", "#6621F7", "#9515BE", "#AC166E", "#A62721", "#864300",
                        "#596200", "#2D7A00", "#0C8500", "#007F2A", "#006D85", "#000000", "#000000", "#000000",
                        "#FFFFFF", "#51A5FE", "#8084FE", "#BC6AFE", "#F15BFE", "#FE5EC4", "#FE7269", "#E19321",
                        "#ADB600", "#79D300", "#51DF21", "#3AD974", "#39C3DF", "#424242", "#000000", "#000000",
                        "#FFFFFF", "#B5D9FE", "#CACAFE", "#E3BEFE", "#F9B8FE", "#FEBAE7", "#FEC3BC", "#F4D199",
                        "#DEE086", "#C6EC87", "#B2F29D", "#A7F0C3", "#A8E7F0", "#ACACAC", "#000000", "#000000",];
    }

    put_pixel(x, y, c){
        this.ctx.fillStyle = c;
        this.ctx.fillRect(x * this.px_size, y * this.px_size, this.px_size, this.px_size);
    }
    
    // These two functions are taken directly from the NesDev wiki
    // https://www.nesdev.org/wiki/PPU_scrolling
    // Check there to see why this works
    coarse_x_inc(){
        if ((this.reg_v & 0x001F) == 0x1F){
            this.reg_v &= ~0x001F;
            this.reg_v ^=  0x0400;
        }
        else this.reg_v++;
    }

    y_inc(){
        if ((this.reg_v & 0x7000) != 0x7000) this.reg_v += 0x1000;
        else{
            v &= ~0x7000;
            let y = (v & 0x03E0) >> 5;
            if (y == 29){
                y = 0;
                this.reg_v ^= 0x0800;
            }
            else if (y == 31) y = 0;
            else y++;
            this.reg_v = (this.reg_v & (~0x03E0) | (y << 5));
        }
    }

    // Returns a scanline buffer for the sprites in the current scanline
    sprite_scanline(scan_index){
        this.sec_oam       =  new Uint8Array(32);
        let sprite_counter =  0;
        for (let i = 0; i < 64; i++){
            if (((this.oam[i] + 1) >= scan_index) && ((this.oam[i] + 1) < (scan_index + 8))){
                for (let j = 0; j < 4; j++) this.sec_oam[(sprite_counter*4) + j] = this.oam[(i*4) + j];
                sprite_counter++;
                if (sprite_counter >= 8) break;
            }
        }
        // This is where the sprite buffer output will be stored
        // Each byte has the format
        // UUBPPPCC
        // U = Unused (0)
        // B = Priority bit
        // P = Palette bits (in reality, the third P bit will always be 1)
        // C = Color bits
        let buffer    =  new Uint8Array(256);
        // Base pattern table address
        let base_pt   = (this.reg_ctrl & 0x08) << 9;
        // Making i increase by 4 saves so many multiplications
        for (let i = 0; i < 32; i += 4){
            // Specifies the strip of the sprite which will be
            // drawn on the scanline as an offset from the base
            // pattern table address
            let spr_offset = (this.sec_oam[i] + 1) - this.scan_index;
            // Vertical sprite flip
            if (this.sec_oam[i+2] & 0x80) spr_offset = 7 - spr_offset;
            // Low byte of sprite color
            let spr_low    =  this.nes.mmap.ppu_get_byte(base_pt | (this.sec_oam[i+1]<<4) |  spr_offset);
            // High byte of sprite color
            let spr_high   =  this.nes.mmap.ppu_get_byte(base_pt | (this.sec_oam[i+1]<<4) | (spr_offset + 8));
            // Palette number of the sprite
            let palette    = (this.sec_oam[i+2] & 0x03) + 4;
            // Saves a handful of operations and makes the code more readable
            let hor_flip   =  this.sec_oam[i+2] & 0x40;
            for (let j = 0; j < 8; j++){
                // Current bit of high and low plane we are reading
                // Also here we handle the horizontal flip logic
                let cur_bit = 1 << (hor_flip ? (7 - j) : j);
                let color   = ((!!(spr_high & cur_bit)) << 1) | (!!(spr_low & cur_bit));
                // We only fill the buffer pixel if its transparent, otherwise
                // keep what was already there
                if (!(buffer[this.sec_oam[i+3]+j] & 0x03)) continue;
                buffer[this.sec_oam[i+3]+j] = (this.sec_oam[i+2] & 0x20) | (palette << 2) | color;
            }
        }
        return buffer;
    }

    bg_scanline(){
        // This buffer doesn't need a priority bit,
        // so it will simply be in the format
        // UUUPPPCC
        // U = Unused (0)
        // P = Palette bits (in reality, the third palette bit will always be 0)
        // C = Color bits
        let buffer  = new Uint8Array(256);
        let bg_low  = this.nes.mmap.ppu_get_byte(0x2000 |  (this.reg_v & 0x0FFF));
        let bg_high = this.nes.mmap.ppu_get_byte(0x2000 | ((this.reg_v & 0x0FFF) + 8));
        for (let i = 0; i < 256; i++){
            // Mask out the fine_y bits
            let color     = ((!!(spr_high & (1 << this.fine_x))) << 1) | (!!(spr_low & (1 << this.fine_x)));
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
            let palette = null;
            // It's easier just to hardcode this part
            if      (at_sector == 0b00){
                palette = (at_group & 0b00000011) >>> 0;
            }
            else if (at_sector == 0b01){
                palette = (at_group & 0b00001100) >>> 2;
            }
            else if (at_sector == 0b10){
                palette = (at_group & 0b00110000) >>> 4;
            }
            else if (at_sector == 0b11){
                palette = (at_group & 0b11000000) >>> 6;
            }
            buffer[i] = (palette << 2) | color;
            // X increment
            if (this.fine_x != 7) this.fine_x++;
            else{
                this.fine_x = 0;
                this.coarse_x_inc();
                // Re-fetch NT data (we only do it here because NT data
                // doesn't change until there is a change in coarse X)
                bg_low    = this.nes.mmap.ppu_get_byte(0x2000 |  (this.reg_v & 0x0FFF));
                bg_high   = this.nes.mmap.ppu_get_byte(0x2000 | ((this.reg_v & 0x0FFF) + 8));
            }
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
        // and then subtracting them
        let t_y = ((this.reg_t & 0b0000011_11100000) >>> 2) | ((this.reg_t & 0b1110000_00000000) >>> 12);
        let v_y = ((this.reg_v & 0b0000011_11100000) >>> 2) | ((this.reg_v & 0b1110000_00000000) >>> 12);
        return v_y - t_y;
    }

    render_scanline(){
        let scan_index = this.calc_scan_index();
        let spr_buf    = this.sprite_scanline(scan_index);
        let bg_buf     = this.bg_scanline();
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
        for (let i = 0; i < 256; i++){
            // We have to mask out the priotity bit
            // we saved in the sprite buffer
            // This if covers the first and second case of the mux
            // table, since if the sprite buffer is also transparent,
            // we will save the transparent color (palette doesn't
            // matter) to the mux buffer
            if      (!bg_buf[i])        mux_buf[i] = spr_buf[i] & 0x1F;
            else if (!spr_buf[i])       mux_buf[i] = bg_buf[i];
            else if (spr_buf[i] & 0x20) mux_buf[i] = bg_buf[i];
            else                        mux_buf[i] = spr_buf[i] & 0x1F;
        }
        // Finally display scanline output
        for (let i = 0; i < 256; i++){
            // Start from the base palette address (0x3F00)
            // and simply add the output in the mux buffer to get
            // the color index
            let col_i = 0x3F00 + mux_buf[i];
            // Color to be displayed in #RRGGBB format
            let raw_c = this.palette[col_i];
            this.put_pixel(i, scan_index, raw_c);
        }
        // These 2 lines are verbose what happens after the scanline
        // has been rendered
        this.y_inc();
        // Set horizontal component of V to horizontal component of T
        this.reg_v = (this.reg_v & (~0b1111011_11100000)) | (this.reg_t & 0b1111011_11100000);
        // Fine X should have stayed the same after rendering the scanline
        // since we do 256 increments of it and always reset it once it
        // reaches 8
    }
}

