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
        this.reg_addr_t = 0x0000;
        this.reg_addr_v = 0x0000;
        this.reg_fine_x = 0x0;
        // Used for determining write state (first or second write)
        // of PPU_SCROLL and PPU_ADDR. It is shared by those two registers.
        // Cleared upon reading PPU_STATUS
        this.latch_w    = 0;
        // Used for rendering in the background, holds the pattern
        // table data of the next 2 background tiles to be rendered
        this.pt_buffer  = [];
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
        this.reg_addr_t = (this.reg_addr_t & 0b1110011_11111111) | ((val & 0x03) << 11);
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
            this.reg_addr_t = (this.reg_addr_t & 0b1111111_11100000) | ((val & 0b11111000) >> 3);
            this.reg_fine_x = val & 0x03;
            this.latch_w = 1;
        }
    }

    set_reg_addr(val){
        if (this.latch){
            this.reg_addr_t = (this.reg_addr_t & 0xFF00) | val;
            this.reg_addr_v =  this.reg_addr_t;
            // Same as before with the latch
            this.latch_w = 0;
        }
        else{
            this.reg_addr_t = (this.reg_addr_t & 0x00FF) | ((val & 0b00111111) << 8);
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
        this.palette = [0x585858, 0x00237C, 0x0D1099, 0x300092, 0x4F006C, 0x600035, 0x5C0500, 0x461800,
                        0x272D00, 0x093E00, 0x004500, 0x004106, 0x003545, 0x000000, 0x000000, 0x000000,
                        0xA1A1A1, 0x0B53D7, 0x3337FE, 0x6621F7, 0x9515BE, 0xAC166E, 0xA62721, 0x864300,
                        0x596200, 0x2D7A00, 0x0C8500, 0x007F2A, 0x006D85, 0x000000, 0x000000, 0x000000,
                        0xFFFFFF, 0x51A5FE, 0x8084FE, 0xBC6AFE, 0xF15BFE, 0xFE5EC4, 0xFE7269, 0xE19321,
                        0xADB600, 0x79D300, 0x51DF21, 0x3AD974, 0x39C3DF, 0x424242, 0x000000, 0x000000,
                        0xFFFFFF, 0xB5D9FE, 0xCACAFE, 0xE3BEFE, 0xF9B8FE, 0xFEBAE7, 0xFEC3BC, 0xF4D199,
                        0xDEE086, 0xC6EC87, 0xB2F29D, 0xA7F0C3, 0xA8E7F0, 0xACACAC, 0x000000, 0x000000,];
    }

    render_scanline(scan_index){
        // We know which scanline we should render by asumuning
        // the register v is at the start of one in the memory space
        this.sec_oam = new Uint8Array(32);
        let sprite_counter = 0;
        for (let i = 0; i < 64; i++){
            if ((this.oam[1] + 1) == scan_index){
                sprite_counter++;
                for (let j = 0; j < 4; j++) this.sec_oam[(sprite_counter*4) + j] = this.oam[(i*4) + j];
                if (sprite_counter >= 8) break;
            }
        }
        
    }
}

