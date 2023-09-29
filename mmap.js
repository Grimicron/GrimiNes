class MMAP{
    // IMPORTANT NOTE TO SELF:
    // The PPU has its own address space from 0x0000 to 0x3FFF
    // seperate from the CPU's address space. They communicate
    // through special memory mapped locations (0x2000 - 0x2007).
    // The address space 0x0000 - 0x1FFF is where the CHR-ROM
    // is stored (usually with a mapping system). That space is
    // called the pattern table.

    constructor(p_nes){
        this.nes = p_nes;
        // Pretty complicated stuff, explained better in the
        // two buffer functions below
        this.ppu_read_buffer   = 0x00;
        // More info about this on the wiki:
        // https://www.nesdev.org/wiki/Open_bus_behavior#PPU_open_bus
        this.ppu_open_bus      = 0x00;
        // First 16 bytes of ROMs contain certain info about it
        this.rom_flags         = new Uint8Array(0x10);
        this.mapper            = null;
    }

    load_rom_flags(rom){
        for (let i = 0; i < 0x10; i++) this.rom_flags[i] = rom[i];
    }
    
    load_rom(rom){
        this.load_rom_flags(rom);
        let mapper_id = ((this.rom_flags[7] & 0xF0) >> 0) | ((this.rom_flags[6] & 0xF0) >> 4);
        this.mapper = mapper_factory(this, mapper_id);
        this.mapper.init(rom);
    }

    get_byte(addr){
        addr = this.mapper.mem_mirror_map[addr];
        // Map to PPU registers
        // I'm not sure what the write only registers should return
        // Reading them doesn't mess with the NES, but I don't know
        // if they return 0 or just stale bus contents
        // Doesn't really matter, though, no program should read or try
        // to use the read contents anyways
        switch (addr){
            case 0x2000:{
                // Write only register
                return this.ppu_open_bus;
            }
            case 0x2001:{
                // Write only register
                return this.ppu_open_bus;
            }
            case 0x2002:{
                let tmp = this.nes.ppu.get_status();
                this.ppu_open_bus = tmp;
                return tmp;
            }
            case 0x2003:{
                // Write only register
                return this.ppu_open_bus;
            }
            case 0x2004:{
                let tmp = this.nes.ppu.get_oam_data();
                this.ppu_open_bus = tmp;
                return tmp;
            }
            case 0x2005:{
                // Write only register
                return this.ppu_open_bus;
            }
            case 0x2006:{
                // Write only register
                return this.ppu_open_bus;
            }
            case 0x2007:{
                let tmp = this.nes.ppu.get_data();
                this.ppu_open_bus = tmp;
                return tmp;
            }
            case 0x4014:{
                // The OAM DMA port is actually on the CPU,
                // not the PPU, so we don't return the PPU
                // open bus here
                return 0x00;
            }
            case 0x4016:{
                return this.nes.controller.get_status();
            }
        }
        return this.mapper.read(addr);
    }

    set_byte(addr, val){
        addr = this.mapper.mem_mirror_map[addr];
        switch (addr){
            case 0x2000:{
                this.nes.ppu.set_ctrl(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x2001:{
                this.nes.ppu.set_mask(val);
                return;
            }
            case 0x2002:{
                // Read only register
                // Writing to it just doesn't do anything, though, it doesn't
                // make the NES crash or anything
                return;
            }
            case 0x2003:{
                this.nes.ppu.set_oam_addr(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x2004:{
                this.nes.ppu.set_oam_data(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x2005:{
                this.nes.ppu.set_scroll(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x2006:{
                this.nes.ppu.set_addr(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x2007:{
                this.nes.ppu.set_data(val);
                this.ppu_open_bus = val;
                return;
            }
            case 0x4014:{
                // Again, this port is on the CPU, not the PPU,
                // so we don't set the PPU open bus here
                this.nes.ppu.oam_dma(val);
                return;
            }
            case 0x4016:{
                this.nes.controller.set_strobe(val);
                return;
            }
        }
        this.mapper.write(addr, val);
    }

    ppu_get_byte(addr){
        return this.mapper.ppu_read(this.mapper.ppu_mirror_map[addr]);
    }

    ppu_get_buffer(addr){
        // This function is the only way the CPU can read from the
        // PPU's VRAM, and is the only place where we use this function,
        // everywhere else, we use the normal PPU read
        // The difference between the normal read and this read is that
        // the PPU read buffer is updated in a weird way, see below
        // https://www.nesdev.org/wiki/PPU_registers#PPUDATA
        let pal_read = addr >= 0x3F00;
        let tmp = pal_read ? this.mapper.ppu_read(this.mapper.ppu_mirror_map[addr]) : this.ppu_read_buffer;
        let mapped_addr = pal_read ? (addr - 0x1000) : addr;
        this.ppu_read_buffer = this.mapper.ppu_read(this.mapper.ppu_mirror_map[mapped_addr]);
        return tmp;
    }
    
    ppu_set_byte(addr, val){
        this.mapper.ppu_write(this.mapper.ppu_mirror_map[addr], val);
    }

    // Returns all the CPU memory in the interval [start, end]
    memdump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            // We send in false for the optional argument mod because
            // we don't want to modify the internal state of the NES when
            // debugging and reading its state
            let current_byte = this.get_byte(i, false);
            // Don't worry if the address is write-only and returns null,
            // the hx_fmt just writes NN in place of an actual value
            result += hx_fmt(current_byte);
        }
        return result;
    }

    // Returns all the PPU memory in the interval [start, end]
    ppudump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            // No such internal state shenanigans in the
            // PPU address space
            result += hx_fmt(this.ppu_get_byte(i));
        }
        return result;
    }
}
