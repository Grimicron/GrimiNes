class MMAP{
    static CPU_MEM_SIZE = 0x10000;
    static PPU_MEM_SIZE = 0x04000;
    static PRG_ROM_BLOCK_SIZE = 0x04000;
    static CHR_ROM_BLOCK_SIZE = 0x02000;

    // IMPORTANT NOTE TO SELF:
    // The PPU has its own address space from 0x0000 to 0x3FFF
    // seperate from the CPU's address space. They communicate
    // through special memory mapped locations (0x2000 - 0x2007).
    // The address space 0x0000 - 0x1FFF is where the CHR-ROM
    // is stored (usually with a mapping system). That space is
    // called the pattern table.

    constructor(p_nes){
        this.nes = p_nes;
        // No need to initialize these, they have all their
        // entries set to 0 by default
        this.cpu_memory        = new Uint8Array(MMAP.CPU_MEM_SIZE);
        this.ppu_memory        = new Uint8Array(MMAP.PPU_MEM_SIZE);
        // Pretty complicated stuff, explained better in the
        // two buffer functions below
        this.ppu_read_buffer   = 0x00;
        // More info about this on the wiki:
        // https://www.nesdev.org/wiki/Open_bus_behavior#PPU_open_bus
        this.ppu_open_bus      = 0x00;
        // Defines how each address is mirrored (most addresses
        // are mirrored to themselves)
        this.mem_mirror_map    = new Uint16Array(MMAP.CPU_MEM_SIZE);
        this.ppu_mirror_map    = new Uint16Array(MMAP.PPU_MEM_SIZE);
        // First 16 bytes of ROMs contain certain info about it
        this.rom_flags         = new Uint8Array(0x10);
    }

    load_prg_rom_block(rom, rom_addr, mmap_addr){
        for (let i = 0; i < MMAP.PRG_ROM_BLOCK_SIZE; i++){
            this.cpu_memory[i + mmap_addr] = rom[i + rom_addr];
        }
    }

    load_prg_rom(rom){
        if      (this.rom_flags[4] == 1){
            this.load_prg_rom_block(rom, 0x0010, 0x8000);
        }
        else if (this.rom_flags[4] == 2){
            this.load_prg_rom_block(rom, 0x0010, 0x8000);
            this.load_prg_rom_block(rom, 0x4010, 0xC000);
        }
    }

    load_chr_rom(rom){
        for (let i = 0; i < MMAP.CHR_ROM_BLOCK_SIZE; i++){
            this.ppu_memory[i] = rom[i + (this.rom_flags[4]*0x4000) + 0x0010];
        }
    }

    load_rom(rom){
        this.load_prg_rom(rom);
        this.load_chr_rom(rom);
    }

    load_rom_flags(rom){
        for (let i = 0; i < 0x10; i++) this.rom_flags[i] = rom[i];
    }
    
    init_mem_mirrors(){
        // Start off with all addresses mirroring themselves
        for (let i = 0x0000; i < MMAP.CPU_MEM_SIZE; i++){
            this.mem_mirror_map[i] = i;
        }
        // Internal RAM mirrors
        for (let i = 0x0800; i <= 0x1FFF; i++){
            this.mem_mirror_map[i] = i % 0x0800;
        }
        // PPU registers mirrors
        for (let i = 0x2008; i <= 0x3FFF; i++){
            this.mem_mirror_map[i] = (i % 8) + 0x2000;
        }
        // If PRG ROM is only 16KB, mirror the upper 16KB
        if (this.rom_flags[4] == 1){
            for (let i = 0xC000; i <= 0xFFFF; i++){
                this.mem_mirror_map[i] = i - 0x4000;
            }
        }
    }

    init_ppu_mirrors(){
        // Start off with all addresses mirroring themselves
        for (let i = 0x0000; i < MMAP.PPU_MEM_SIZE; i++){
            this.ppu_mirror_map[i] = i;
        }
        // Vertical NT mirroring
        if (this.rom_flags[6] & 0x01){
            for (let i = 0x2800; i <= 0x2FFF; i++){
                this.ppu_mirror_map[i] = i - 0x0800;
            }
        }
        // Horizontal NT mirroring
        else{
            for (let i = 0x2400; i <= 0x27FF; i++){
                this.ppu_mirror_map[i] = i - 0x0400;
            }
            for (let i = 0x2C00; i <= 0x2FFF; i++){
                this.ppu_mirror_map[i] = i - 0x0400;
            }
        }
        // Weird mirroring, check wiki for more info:
        // https://www.nesdev.org/wiki/PPU_memory_map
        for (let i = 0x3000; i <= 0x3EFF; i++){
            this.ppu_mirror_map[i] = this.ppu_mirror_map[i - 0x1000];
        }
        // Palette mirroring
        this.ppu_mirror_map[0x3F10] = 0x3F00;
        this.ppu_mirror_map[0x3F14] = 0x3F04;
        this.ppu_mirror_map[0x3F18] = 0x3F08;
        this.ppu_mirror_map[0x3F1C] = 0x3F0C;
        for (let i = 0x3F20; i <= 0x3FFF; i++){
            // Again, a kind of weird mirroring, check wiki for more info
            // (link above)
            this.ppu_mirror_map[i] = this.ppu_mirror_map[0x3F00 | (i % 0x20)];
        }
    }

    get_byte(addr){
        addr = this.mem_mirror_map[addr];
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
        return this.cpu_memory[addr];
    }

    set_byte(addr, val){
        addr = this.mem_mirror_map[addr];
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
        // PRG ROM can't be modified
        if (addr < 0xC000) this.cpu_memory[addr] = val;
    }

    ppu_get_byte(addr){
        return this.ppu_memory[this.ppu_mirror_map[addr]];
    }

    ppu_get_buffer(addr){
        // This function is the only way the CPU can read from the
        // PPU's VRAM, and is the only place where we use this function,
        // everywhere else, we use the normal PPU read
        // The difference between the normal read and this read is that
        // the PPU read buffer is updated in a weird way, see below
        // https://www.nesdev.org/wiki/PPU_registers#PPUDATA
        let pal_read = addr >= 0x3F00;
        let tmp = pal_read ? this.ppu_memory[this.ppu_mirror_map[addr]] : this.ppu_read_buffer;
        let mapped_addr = pal_read ? (addr - 0x1000) : addr;
        this.ppu_read_buffer = this.ppu_memory[this.ppu_mirror_map[mapped_addr]];
        return tmp;
    }
    
    ppu_set_byte(addr, val){
        let mapped_addr = this.ppu_mirror_map[addr];
        if (mapped_addr >= 0x2000) this.ppu_memory[mapped_addr] = val;
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
