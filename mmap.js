class MMAP{
    static CPU_MEM_SIZE = 0x10000;
    static PPU_MEM_SIZE = 0x04000;
    static PRG_ROM_BLOCK_SIZE = 0x04000;
    static CHR_ROM_BLOCK_SIZE = 0x02000;
    static cpu_memory;
    static ppu_memory;

    // IMPORTANT NOTE TO SELF:
    // The PPU has its own address space from 0x0000 to 0x3FFF
    // seperate from the CPU's address space. They communicate
    // through special memory mapped locations (0x2003: OAMADDR,
    // 0x2004: OAMDATA, 0x4014: OAMDMA). The address space
    // 0x0000 - 0x1FFF is where the CHR-ROM is stored (usually
    // with a mapping system). That space is called the pattern
    // table.

    static init(){
        MMAP.cpu_memory = new Uint8Array(MMAP.CPU_MEM_SIZE);
        MMAP.ppu_memory = new Uint8Array(MMAP.PPU_MEM_SIZE);
        // No need to initialize these to have all their entries
        // set to 0, they are 0 by default
    }

    static load_prg_rom_block(rom, rom_addr, mmap_addr){
        for (let i = 0; i < MMAP.PRG_ROM_BLOCK_SIZE; i++){
            MMAP.cpu_memory[i + mmap_addr] = rom[i + rom_addr];
        }
    }

    static load_prg_rom(rom){
        // For testing purpouses currently, we assume
        // NROM-128 mapper, meaning we mirror the PRG-ROM
        // from 0x8000 - 0xBFFF to 0xC000 - 0xFFFF
        // We start at 0x0010 in the ROM to ignore the 
        // 16 bytes of headers
        MMAP.load_prg_rom_block(rom, 0x0010, 0x8000);
    }

    static load_chr_rom(rom){
        for (let i = 0; i < MMAP.CHR_ROM_BLOCK_SIZE; i++){
            // We start at 0x0000 so no need for an offset
            // in the ppu_memory
            // In the ROM, we need to skip the headers (0x0010)
            // and the PRG-ROM (0x4000)
            MMAP.ppu_memory[i] = rom[i + 0x4000 + 0x0010];
        }
    }

    static load_rom(rom){
        MMAP.load_prg_rom(rom);
        MMAP.load_chr_rom(rom);
    }

    static get_byte(addr){
        // Always occurs
        if ((addr >= 0x2008) && (addr <= 0x3FFF)) return MMAP.get_byte((addr % 8) + 0x2000);
        // NROM-128 mirroring behaviour
        if ((addr >= 0xC000) && (addr <= 0xFFFF)) return MMAP.get_byte(addr - 0x4000);
        return MMAP.cpu_memory[addr];
    }

    static set_byte(addr, val){
        if ((addr >= 0x2008) && (addr <= 0x3FFF)){
            MMAP.set_byte((addr % 8) + 0x2000);
            return;
        }
        // NROM-128 mirroring behaviour
        // NROM-128 mirroring behaviour
        if ((addr >= 0xC000) && (addr <= 0xFFFF)){
            MMAP.set_byte(addr - 0x4000);
            return;
        }
        MMAP.cpu_memory[addr] = val;
    }

    // Prints out all the CPU memory in the interval [start, end]
    // Also returns it for use in other utilites/debug purpouses
    static memdump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            result += MMAP.get_byte(i).toString(16).padStart(2, "0");
        }
        console.log(result);
        return result;
    }

    // Prints out all the PPU memory in the interval [start, end]
    // Also returns it for use in other utilites/debug purpouses
    static ppudump(start, end){
        let result = "";
        for (let i = start; i <= end; i++){
            result += MMAP.ppu_memory[i].toString(16).padStart(2, "0");
        }
        console.log(result);
        return result;
    }
}

