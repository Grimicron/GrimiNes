// DOCS:
// https://llx.com/Neil/a2/opcodes.html
// https://www.cpu-world.com/Arch/650x.html
// https://www.pagetable.com/c64ref/6502/?tab=2#
// https://www.nesdev.org/wiki/CPU_ALL
// https://www.nesdev.org/wiki/CPU_interrupts
// https://www.masswerk.at/nowgobang/2021/6502-illegal-opcodes
// https://www.nesdev.org/wiki/Programming_with_unofficial_opcodes
// https://www.nesdev.org/wiki/CPU_unofficial_opcodes

// IMPORTANT NOTE TO SELF:
// Even though the MOS6502/Ricoh2A03 are little-endian, the opcode identifier
// goes first (lower address) in the ROM, followed by the operands

class CPU{
    static C_FLAG = 0x0;
    static Z_FLAG = 0x1;
    static I_FLAG = 0x2;
    // Pretty sure this does nothing whether it's set or not
    // since the Ricoh2A03 literally doesn't have a BCD mode
    // but it doesn't hurt to implement it (not BCD mode, just
    // setting and clearing the flag)
    static D_FLAG = 0x3;
    // Bits 5 and 4 literally do nothing
    // Bit 5 is physically always set to HIGH (1) in the original CPU
    // Bit 4 (B_FLAG) is set when an interrupt is called depending on the type of
    // interrupt before it's pushed on the stack, but then it's just
    // discarded when restored to the processor status
    static B_FLAG = 0x4;
    static V_FLAG = 0x6;
    static N_FLAG = 0x7;
    
    constructor(p_nes){
        this.nes         = p_nes
        this.acc         = 0x00;
        this.x_reg       = 0x00;
        this.y_reg       = 0x00;
        // Wiki says it start like this
        // (0b00111000)
        // Note that bit 5, the truly unused bit, starts
        // at 1 and should NEVER be touched again. It doesn't
        // really matter if it is modified, though
        // I don't know why the B flag starts as 1, it just
        // does, I guess
        this.proc_status = 0x34;
        // Stack pointer is actually an 8bit register
        // but the stack is located in 0x0100 - 0x01FF
        // so we need to offset it by 0x0100 when we use it
        // Also, the wiki says it starts at 0xFD, so I'll trust
        // it (every program should initalize it properly
        // anyways)
        this.stack_ptr   = 0xFD;
        // It is initialized in reset()
        this.prg_counter = 0x0000; 
        this.req_irq     = false;
        this.req_nmi     = false;
    }

    reset(){
        // Load reset/power-on vector into PC
        this.prg_counter = (this.nes.mmap.get_byte(0xFFFD) << 8) | this.nes.mmap.get_byte(0xFFFC);
    }

    push(val){
        this.nes.mmap.set_byte(0x0100 + this.stack_ptr, val);
        // Since the MOS 6502 was so cheap, the stack
        // pointer didn't have logic to handle overflow
        // or underflow, as such, it wraps around
        this.stack_ptr = (this.stack_ptr - 1) & 0xFF;
    }

    pop(){
        let val = this.nes.mmap.get_byte(0x0100 + this.stack_ptr+1);
        // Reason for this stated above
        this.stack_ptr = (this.stack_ptr + 1) & 0xFF;
        return val;
    }

    get_flag(pos){
        return !!(this.proc_status & (1<<pos));
    }

    set_flag(pos, val){
        //!! There is probably a better way to do this
        // Make val 0 or 1 depending on if it's truthy or not
        // to make code more compact when setting flags
        let flag_bit = (!!val) << pos;
        // Create base which is identical to current proc_status
        // except the flag bit is always 
        let base = (~(1 << pos)) & this.proc_status;
        // Finally add in the flag bit if it's 1
        this.proc_status = base | flag_bit;
    }

    // IMPORTANT NOTE TO SELF:
    // A page is every 0x0100 bytes and a page is crossed when an addition
    // between memory addresses changes the page byte (the high byte)
    // between the augend and the sum. This causes an extra cycle to be
    // taken on most instructions

    // Throughout all these addressing mode fetching instructions,
    // we only return the page_crossed property if the addressing
    // mode can add an extra cycle because of a page being crossed
    accumulator(){
        // Returning an address doesn't make any sense since the
        // accumulator is a register, so the instructions which use
        // accumulator addressing mode should handle this exception
        // themselves
        return {bytes_used: 0, addr: null};
    }

    immediate(){ 
        // Second byte of instruction is the data itself
        return {bytes_used: 1, addr: this.prg_counter+1};
    }
    
    absolute(){
        // Second and third bytes of instruction are a 16bit pointer
        // to the data
        let ptr = (this.nes.mmap.get_byte(this.prg_counter+2) << 8) | this.nes.mmap.get_byte(this.prg_counter+1);
        return {bytes_used: 2, addr: ptr};
    }

    zero_page(){
        // Second byte of instruction points to data in zero-page
        return {bytes_used: 1, addr: this.nes.mmap.get_byte(this.prg_counter+1)};
    }

    indexed_zp_x(){ // addr8, X
        // Second byte of instruction gets the contents of X added to it
        // (carry is ignored) and the resulting pointer points to the data
        // in the zero-page
        let zp_ptr = (this.nes.mmap.get_byte(this.prg_counter+1) + this.x_reg) & 0xFF;
        return {bytes_used: 1, addr: zp_ptr};
    }

    indexed_zp_y(){ // addr8, Y
        // Second byte of instruction gets the contents of Y added to it
        // (carry is ignored) and the resulting pointer points to the data
        // in the zero-page
        let zp_ptr = (this.nes.mmap.get_byte(this.prg_counter+1) + this.y_reg) & 0xFF;
        return {bytes_used: 1, addr: zp_ptr};
    }

    indexed_abs_x(){ // addr16, X
        // Second and third byte of instruction get contents of X added to
        // them and the resulting pointer points to the data (I'm ingoring
        // carry but I don't know if that's how it's done)
        let ptr = (this.nes.mmap.get_byte(this.prg_counter+2) << 8) | this.nes.mmap.get_byte(this.prg_counter+1);
        let indexed_ptr = (ptr + this.x_reg) & 0xFFFF;
        let page_cross = (ptr>>>8) != (indexed_ptr>>>8);
        return {bytes_used: 2, addr: indexed_ptr, page_crossed: page_cross};
    }

    indexed_abs_y(){ // addr16, Y
        // Second and third byte of instruction get contents of Y added to
        // them and the resulting pointer points to the data (I'm ingoring
        // carry but I don't know if that's how it's done)
        let ptr = (this.nes.mmap.get_byte(this.prg_counter+2) << 8) | this.nes.mmap.get_byte(this.prg_counter+1);
        let indexed_ptr = (ptr + this.y_reg) & 0xFFFF;
        let page_cross = (ptr>>>8) != (indexed_ptr>>>8);
        return {bytes_used: 2, addr: indexed_ptr, page_crossed: page_cross};
    }

    relative(){
        // Returns the current program counter shifted by the signed byte
        // but pretending it's already at the next instruction (+2)
        // Convert to 16 bit signed integer
        let signed_offset = this.nes.mmap.get_byte(this.prg_counter+1);
        signed_offset |= (signed_offset & 0x80) ? 0xFF00 : 0x0000;
        // Read note to self above branch instructions implementation
        // as to why this happens
        let ptr = this.prg_counter + 2;
        // Using 32bit signed offset because it makes my life easier not
        // having to deal with that arithmetic and just doing a 16bit
        // mask at the end
        let indexed_ptr = (ptr + signed_offset) & 0xFFFF;
        let page_cross = (ptr>>>8) != (indexed_ptr>>>8);
        return {bytes_used: 1, addr: indexed_ptr, page_crossed: page_cross};
    }

    indexed_indirect(){ // (addr8, X)
        // Pointer to 16bit pointer stored in the zero-page
        let zp_ptr = (this.nes.mmap.get_byte(this.prg_counter+1) + this.x_reg) & 0xFF;
        // 16bit pointer to data in memory
        // I think zp_ptr + 1 should wrap around by ignoring carry but
        // I'm not completely sure
        let true_ptr = (this.nes.mmap.get_byte((zp_ptr + 1) & 0xFF) << 8) | this.nes.mmap.get_byte(zp_ptr);
        return {bytes_used: 1, addr: true_ptr};
    }

    indirect_indexed(){ // (addr8), Y
        // This addressing mode is so confusing, just read the docs:
        // https://stackoverflow.com/questions/46262435/indirect-y-indexed-addressing-mode-in-mos-6502
        let zp_ptr = this.nes.mmap.get_byte(this.prg_counter+1);
        // Pretty sure if zp_ptr is 0xFF, then it wraps around for the high byte and goes to 0x00
        let true_ptr = (this.nes.mmap.get_byte((zp_ptr + 1) & 0xFF) << 8) | this.nes.mmap.get_byte(zp_ptr);
        let indexed_ptr = (true_ptr + this.y_reg) & 0xFFFF;
        let page_cross = (true_ptr>>>8) != (indexed_ptr>>>8);
        // I'm really not sure if that's how the page-crossing works on this addressing
        // mode but it's the only option that made sense to me since I couldn't find much
        // information on this
        return {bytes_used: 1, addr: indexed_ptr, page_crossed: page_cross};
    }

    absolute_indirect(){ // (addr16)
        // Second and third bytes of instruction point to a location
        // in memory where a 16bit pointer is located which points to
        // the data
        let indirect_ptr = (this.nes.mmap.get_byte(this.prg_counter+2) << 8) | this.nes.mmap.get_byte(this.prg_counter+1);
        let true_ptr_low = this.nes.mmap.get_byte(indirect_ptr);
        // If the indirect pointer is 0x??FF, then it wraps around to 0x??00
        let true_ptr_high = this.nes.mmap.get_byte((indirect_ptr & 0xFF00) | ((indirect_ptr + 1) & 0x00FF));
        let true_ptr = (true_ptr_high << 8) | true_ptr_low;
        return {bytes_used: 2, addr: true_ptr};
    }

    group_one_get_data(op_id, addr_mode){
        // Every group 1 instruction follows a regular pattern
        // on how many cycles it takes to complete, so we can handle
        // that here (except STA, which always takes the extra
        // page-cross cycle when possible for some reason???)
        let is_sta = op_id == 0x4;
        let data = null;
        switch (addr_mode){
            case 0x0:
                data = this.indexed_indirect();
                data.cycles = 6;
                break;
            case 0x1:
                data = this.zero_page();
                data.cycles = 3;
                break;
            case 0x2:
                data = this.immediate();
                data.cycles = 2;
                break;
            case 0x3:
                data = this.absolute();
                data.cycles = 4;
                break;
            case 0x4:
                data = this.indirect_indexed();
                data.cycles = 5 + (is_sta ? 1 : data.page_crossed);
                break;
            case 0x5:
                data = this.indexed_zp_x();
                data.cycles = 4;
                break;
            case 0x6:
                data = this.indexed_abs_y();
                data.cycles = 4 + (is_sta ? 1 : data.page_crossed);
                break;
            case 0x7:
                data = this.indexed_abs_x();
                data.cycles = 4 + (is_sta ? 1 : data.page_crossed);
                break;
        }
        return data;
    }

    group_two_get_data(id, addr_mode){
        // STX and LDX break the pattern in absolute,
        // zero-page, indexed zero-page, indexed absolute
        // addressing mode (ugh...)
        let exception_op = (id == 0x4) || (id == 0x5);
        let data = null;
        switch (addr_mode){
            case 0x0:
                data = this.immediate();
                // Only instruction that uses immediate
                // addressing mode is LDX, so no neeed for
                // weird exceptions
                data.cycles = 2;
                break;
            case 0x1:
                data = this.zero_page();
                data.cycles = exception_op ? 3 : 5;
                break;
            case 0x2:
                data = this.accumulator();
                // All the ops which use accumulator addressing
                // mode follow a regular pattern so no exceptions
                data.cycles = 2;
                break;
            case 0x3:
                data = this.absolute();
                data.cycles = exception_op ? 4 : 6;
                break;
            case 0x5:
                // addr8, X becomes addr8, Y for STX and LDX
                data = exception_op ? this.indexed_zp_y() : this.indexed_zp_x();
                data.cycles = exception_op ? 4 : 6;
                break;
            case 0x7:
                // addr16, X becomes addr16, Y for LDX (STX doesn't support
                // absolute indexed addressing mode)
                data = exception_op ? this.indexed_abs_y() : this.indexed_abs_x();
                data.cycles = exception_op ? (4+data.page_crossed) : 7;
                break;
        }
        return data;
    }

    group_three_get_data(addr_mode){
        let data = null;
        switch(addr_mode){
            case 0x0:
                data = this.immediate();
                data.cycles = 2;
                break;
            case 0x1:
                data = this.zero_page();
                data.cycles = 3;
                break;
            case 0x3:
                data = this.absolute();
                data.cycles = 4;
                break;
            case 0x5:
                data = this.indexed_zp_x();
                data.cycles = 4;
                break;
            case 0x7:
                data = this.indexed_abs_x();
                data.cycles = 4 + data.page_crossed;
                break;
        }
        return data;
    }

    // For the illegal opcodes with a pattern in
    // their addressing modes
    group_ill_get_data(op_id, addr_mode){
        // There are so many addressing mode and cycle
        // amount exceptions
        // SLO, RLA, SRE, RRA, DCP, ISC all follow a nice
        // pattern, it's just SAX, AHX, LAX, LAS which
        // cause some trouble
        // Luckily, SAX and LAX share the same cycle count
        // for the addressing modes they do share
        // And then AHX and LAS are pretty simple
        let data = null;
        switch(addr_mode){
            case 0x0:
                data = this.indexed_indirect();
                // SAX, LAX exception
                data.cycles = ((op_id == 4) || (op_id == 5)) ? 6 : 8;
                break;
            case 0x1:
                data = this.zero_page();
                // SAX, LAX exception
                data.cycles = ((op_id == 4) || (op_id == 5)) ? 3 : 5;
                break;
            case 0x2:
                // Illegal opcodes with immediate addressing modes
                // all handle their own cycles
                data = this.immediate();
                break;
            case 0x3:
                data = this.absolute();
                // SAX, LAX exception
                data.cycles = ((op_id == 4) || (op_id == 5)) ? 4 : 6;
                break;
            case 0x4:
                data = this.indirect_indexed();
                // LAX, AHX exception
                data.cycles = (op_id == 4) ? 6 : ((op_id == 5) ? (5 + data.page_crossed) : 8);
                break;
            case 0x5:
                // SAX and LAX have addr8, Y instead of addr8, X
                if ((op_id == 0x4) || (op_id == 0x5)) data = this.indexed_zp_y();
                else                                  data = this.indexed_zp_x();
                // SAX, LAX exception
                data.cycles = ((op_id == 4) || (op_id == 5)) ? 4 : 6;
                break;
            case 0x6:
                data = this.indexed_abs_y();
                // LAS exception
                data.cycles = (op_id == 5) ? (4 + data.page_crossed) : 7;
                break;
            case 0x7:
                // AHX and LAX have addr16, Y instead of addr16, X
                if ((op_id == 0x4) || (op_id == 0x5)) data = this.indexed_abs_y();
                else                                  data = this.indexed_abs_x();
                // LAX, AHX exception
                data.cycles = (op_id == 4) ? 5 : ((op_id == 5) ? (4 + data.page_crossed) : 7);
                break;
        }
        return data;
    }
    
    group_get_data(id, addr_mode, group){
        // Opcode ID needed for group 1 since STA is an exception
        if      (group == 0x1) return this.group_one_get_data(id, addr_mode);
        // Opcode ID needed for group 2 because STX and LDX are exceptions
        else if (group == 0x2) return this.group_two_get_data(id, addr_mode);
        // Opcide ID not needed for group 3 as there are no exceptions
        // (surprisingly enough!)
        else if (group == 0x0) return this.group_three_get_data(addr_mode);
        // Addressing mode not found
        return null;
    }

    irq(){
        // I'm actually not sure how many cycles it takes if the
        // IRQ is masked, but probably just 0
        if (this.get_flag(CPU.I_FLAG)) return 0;
        // Push high PC
        this.push((this.prg_counter & 0xFF00) >>> 8);
        // Push low PC
        this.push((this.prg_counter & 0x00FF) >>> 0);
        // Push proc status with B_FLAG set for some goddamn reason???
        this.set_flag(CPU.B_FLAG, 0);
        this.push(this.proc_status);
        // Wiki says that interrupts automatically set the I flag to 1
        // https://www.nesdev.org/wiki/Status_flags
        this.set_flag(CPU.I_FLAG, 0);
        this.prg_counter = (this.nes.mmap.get_byte(0xFFFF) << 8) | this.nes.mmap.get_byte(0xFFFE);
        return 7;
    }

    nmi(){
        // Push high PC
        this.push((this.prg_counter & 0xFF00) >>> 8);
        // Push low PC
        this.push((this.prg_counter & 0x00FF) >>> 0);
        // Push proc status with B_FLAG not set for some goddamn reason???
        this.set_flag(CPU.B_FLAG, 0);
        this.push(this.proc_status);
        // Wiki says that interrupts automatically set the I flag to 1
        // https://www.nesdev.org/wiki/Status_flags
        this.set_flag(CPU.I_FLAG, 1);
        this.prg_counter = (this.nes.mmap.get_byte(0xFFFB) << 8) | this.nes.mmap.get_byte(0xFFFA);
        return 7;
    }

    exec_group_one(op_id, op_addr_mode, data){
        switch (op_id){
            // Curly braces in the cases because of weird
            // JS scoping shenanigans
            case 0x0:{ // ORA
                this.acc |= this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x1:{ // AND
                this.acc &= this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x2:{ // EOR
                this.acc ^= this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x3:{ // ADC
                let val = this.nes.mmap.get_byte(data.addr);
                let result = this.acc + val + this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                // Formula for V flag taken from
                // http://www.righto.com/2012/12/the-6502-overflow-flag-explained.html
                this.set_flag(CPU.V_FLAG, (this.acc^result) & (val^result) & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.acc = result;
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x4:{ // STA
                // Only exception in group 1, since STA needs an
                // actual memory address to store the accumulator,
                // using immediate addressing mode makes no sense
                if (op_addr_mode == 0x2) return null;
                this.nes.mmap.set_byte(data.addr, this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x5:{ // LDA
                this.acc = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x6:{ // CMP
                let val = this.nes.mmap.get_byte(data.addr);
                let result = this.acc + ones_comp(val) + 1;
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x7:{ // SBC
                // M - N - B = M + ones_comp(N) + C
                let val = ones_comp(this.nes.mmap.get_byte(data.addr));
                let result = this.acc + val + this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.V_FLAG, (this.acc^result) & (val^result) & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.acc = result;
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
        }
        return null;
    }

    exec_group_two(op_id, op_addr_mode, data){
        switch (op_id){
            case 0x0:{ // ASL
                // Immediate addressing mode not allowed
                if (op_addr_mode == 0x0) return null;
                // Handle accumulator addressing mode
                let val = (op_addr_mode == 0x2) ? this.acc : this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.C_FLAG, val & 0x80);
                val = (val << 1) & 0xFF;
                this.set_flag(CPU.Z_FLAG, !val);
                this.set_flag(CPU.N_FLAG, val & 0x80);
                // Again handle accumulator addressing mode
                if (op_addr_mode == 0x2) this.acc = val;
                else this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x1:{ // ROL
                // Immediate addressing mode not allowed
                if (op_addr_mode == 0x0) return null;
                // Same as before
                let val = (op_addr_mode == 0x2) ? this.acc : this.nes.mmap.get_byte(data.addr);
                let high_bit = val & 0x80;
                val = ((val << 1) & 0xFF) | this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, high_bit);
                this.set_flag(CPU.Z_FLAG, !val);
                this.set_flag(CPU.N_FLAG, val & 0x80);
                if (op_addr_mode == 0x2) this.acc = val;
                else this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x2:{ // LSR
                // Immediate addressing mode not allowed
                if (op_addr_mode == 0x0) return null;
                // Same as before
                let val = (op_addr_mode == 0x2) ? this.acc : this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.C_FLAG, val & 0x01);
                val = val >>> 1;
                this.set_flag(CPU.Z_FLAG, !val);
                // N_FLAG will always be 0 after LSR (obviously!)
                this.set_flag(CPU.N_FLAG,  0);
                if (op_addr_mode == 0x2) this.acc = val;
                else this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x3:{ // ROR
                // Immediate addressing mode not allowed
                if (op_addr_mode == 0x0) return null;
                // Same as before
                let val = (op_addr_mode == 0x2) ? this.acc : this.nes.mmap.get_byte(data.addr);
                let low_bit = val & 0x01;
                val = (val >>> 1) | (this.get_flag(CPU.C_FLAG) << 7);
                this.set_flag(CPU.C_FLAG, low_bit);
                this.set_flag(CPU.N_FLAG, val & 0x80);
                this.set_flag(CPU.Z_FLAG, !val);
                if (op_addr_mode == 0x2) this.acc = val;
                else this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            // These four next instruction don't support accumulator
            // mode so no need to worry about that exception
            case 0x4:{ // STX
                // Absolute indexed, immediate, accumulator addressing
                // modes not allowed in this instrucion
                if ((op_addr_mode == 0x7)
                  ||(op_addr_mode == 0x0)
                  ||(op_addr_mode == 0x2)) return null;
                this.nes.mmap.set_byte(data.addr, this.x_reg);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x5:{ // LDX
                // Accumulator addressing mode not allowed
                if (op_addr_mode == 0x2) return null;
                this.x_reg = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.Z_FLAG, !this.x_reg);
                this.set_flag(CPU.N_FLAG, this.x_reg & 0x80);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x6:{ // DEC
                // Immediate and accumulator addressing modes not allowed
                if ((op_addr_mode == 0x0)
                  ||(op_addr_mode == 0x2)) return null;
                let val = this.nes.mmap.get_byte(data.addr);
                val = (val - 1) & 0xFF;
                this.set_flag(CPU.N_FLAG, val & 0x80);
                this.set_flag(CPU.Z_FLAG, !val);
                this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x7:{ // INC
                // Immediate and accumulator addressing modes not allowed
                if ((op_addr_mode == 0x0)
                  ||(op_addr_mode == 0x2)) return null;
                let val = this.nes.mmap.get_byte(data.addr);
                val = (val + 1) & 0xFF;
                this.set_flag(CPU.N_FLAG, val & 0x80);
                this.set_flag(CPU.Z_FLAG, !val);
                this.nes.mmap.set_byte(data.addr, val);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
        }
        return null;
    }

    exec_group_three(op_id, op_addr_mode, data){
        switch (op_id){
            case 0x1:{ // BIT
                // This is such a weird instruction
                // Immediate, zero page indexed, absolute indexed addressing
                // modes not allowed for this instruction
                if ((op_addr_mode == 0x0)
                  ||(op_addr_mode == 0x5)
                  ||(op_addr_mode == 0x7)) return null;
                let val = this.nes.mmap.get_byte(data.addr);
                // I think this is how it's done, but it could
                // be that its the 7th and 6th bits of the RESULT
                // of the and between the data and accumulator
                this.set_flag(CPU.N_FLAG, val & 0x80);
                this.set_flag(CPU.V_FLAG, val & 0x40);
                // This one I'm sure of though
                this.set_flag(CPU.Z_FLAG, !(val & this.acc));
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            // Gap here because I didn't include JMP in group 3
            case 0x4:{ // STY
                // Immediate and absolute indexed addressing modes
                // not allowed for this intruction
                if ((op_addr_mode == 0x0)
                  ||(op_addr_mode == 0x7)) return null;
                this.nes.mmap.set_byte(data.addr, this.y_reg);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x5:{ // LDY
                this.y_reg = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.y_reg & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.y_reg);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x6:{ // CPY
                // Zero page indexed, absolute indexed addressing
                // modes not allowed for this instruction
                if ((op_addr_mode == 0x5)
                  ||(op_addr_mode == 0x7)) return null;
                let val = this.nes.mmap.get_byte(data.addr);
                let result = this.y_reg + ones_comp(val) + 1;
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x7:{ // CPX
                // Zero page indexed, absolute indexed addressing
                // modes not allowed for this instruction
                if ((op_addr_mode == 0x5)
                  ||(op_addr_mode == 0x7)) return null;
                let val = this.nes.mmap.get_byte(data.addr);
                let result = this.x_reg + ones_comp(val) + 1;
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
        }
        return null;
    }
    
    // Returns amount of cycles used to complete instruction
    exec_op(){
        // It's pretty boring to do this wrapping thing on every single
        // instance where we increase the program counter, so I'll just do
        // it here
        this.prg_counter &= 0xFFFF;
        if      (this.req_nmi){
            this.req_nmi = false;
            // Read docs as to why this happens
            // https://www.nesdev.org/wiki/CPU_interrupts
            this.req_irq = false;
            return this.nmi();
        }
        else if (this.req_irq){
            this.req_irq = false;
            return this.irq();
        }
        let opcode = this.nes.mmap.get_byte(this.prg_counter);
        // See utils.js as to why we send those two extra arguments
        debug_log(hx_fmt(this.prg_counter, true, true) + ": " + hx_fmt(opcode, false, true));
        // Check for all the single byte instructions since they don't really
        // fit any pattern
        if (opcode == 0x00){ // BRK
            // I think I_FLAG only blocks external IRQs
            // Read docs as to why this happens
            this.prg_counter += 2;
            // Push high PC
            this.push((this.prg_counter & 0xFF00) >>> 8);
            // Push low PC
            this.push((this.prg_counter & 0x00FF) >>> 0);
            // Pretty sure that we push with the B Flag set
            // https://www.nesdev.org/the%20'B'%20flag%20&%20BRK%20instruction.txt
            // Remember bit 5 is always high
            this.push(this.proc_status | (1<<CPU.B_FLAG) | 0b00100000);
            // Wiki says that interrupts automatically set the I flag to 1
            // https://www.nesdev.org/wiki/Status_flags
            this.set_flag(CPU.I_FLAG, 1);
            this.prg_counter = (this.nes.mmap.get_byte(0xFFFF) << 8) | this.nes.mmap.get_byte(0xFFFE);
            return 7;
        }
        if (opcode == 0x40){ // RTI
            // Remeber bit 5 is always high
            this.proc_status = this.pop() | 0b00100000;
            // For some godforsaken reason
            this.set_flag(CPU.B_FLAG, 0);
            // Make sure order of operations doesn't mess us up
            this.prg_counter  = 0x0000;
            this.prg_counter |= this.pop();
            this.prg_counter |= this.pop() << 8;
            return 6;
        }
        if (opcode == 0x60){ // RTS
            // Make sure order of operations doesn't mess up
            this.prg_counter = 0x0000;
            this.prg_counter |= this.pop();
            this.prg_counter |= this.pop() << 8;
            // Read docs as to why this happens
            this.prg_counter++;
            return 6;
        }
        if (opcode == 0x08){ // PHP
            // For some godforsaken reason, PHP pushes the B_FLAG set
            // And also, bit 5 is always high
            this.push(this.proc_status | (1<<CPU.B_FLAG) | 0b00100000);
            this.prg_counter++;
            return 3;
        }
        if (opcode == 0x28){ // PLP
            // Remember bit 5 is always high
            this.proc_status = this.pop() | 0b00100000;
            // For some godforsaken reason
            this.set_flag(CPU.B_FLAG, 0);
            this.prg_counter++;
            return 4;
        }
        if (opcode == 0x48){ // PHA
            this.push(this.acc);
            this.prg_counter++;
            return 3;
        }
        if (opcode == 0x68){ // PLA
            this.acc = this.pop();
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return 4;
        }
        if (opcode == 0x88){ // DEY
            this.y_reg = (this.y_reg - 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xA8){ // TAY
            this.y_reg = this.acc;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xC8){ // INY
            this.y_reg = (this.y_reg + 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xE8){ // INX
            this.x_reg = (this.x_reg + 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x18){ // CLC
            this.set_flag(CPU.C_FLAG, 0);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x38){ // SEC
            this.set_flag(CPU.C_FLAG, 1);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x58){ // CLI
            this.set_flag(CPU.I_FLAG, 0);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x78){ // SEI
            this.set_flag(CPU.I_FLAG, 1);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x98){ // TYA
            this.acc = this.y_reg;
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xB8){ // CLV
            this.set_flag(CPU.V_FLAG, 0);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xD8){ // CLD
            this.set_flag(CPU.D_FLAG, 0);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xF8){ // SED
            this.set_flag(CPU.D_FLAG, 1);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x8A){ // TXA
            this.acc = this.x_reg;
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0x9A){ // TXS
            this.stack_ptr = this.x_reg;
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xAA){ // TAX
            this.x_reg = this.acc;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xBA){ // TSX
            this.x_reg = this.stack_ptr;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xCA){ // DEX
            this.x_reg = (this.x_reg - 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return 2;
        }
        if (opcode == 0xEA){ // NOP
            // Lmao what do you want me to do bruhhhhhh
            this.prg_counter++;
            return 2;
        }
        // Check for JMP instruction (since it's a bit iffy when you try
        // to fit it with the other groups)
        if (opcode == 0x4C){ // JMP (Absolute)
            let data = this.absolute();
            this.prg_counter = data.addr;
            return 3;
        }
        if (opcode == 0x6C){ // JMP (Absolute Indirect)
            let data = this.absolute_indirect();
            this.prg_counter = data.addr;
            return 5;
        }
        // Check for branch instructions. They are formatted so that
        // they're XXY10000, where XX indicates the flag to check and
        // Y represents the value to check it against
        // IMPORTANT NOTE TO SELF:
        // The branch instruction adds the offset to the program counter
        // once it has moved on to the next instruction, not when it's
        // still at the signed offset (in the real hardware)
        if ((opcode & 0x1F) == 0x10){
            // This system massively simplifies the code for all the branches
            // but it may be the case that some subtleties break or something
            let flag_id  = (opcode & 0xC0) >> 6;
            let flag_val = (opcode & 0x20) >> 5;
            let flag = null;
            if      (flag_id == 0x0) flag = CPU.N_FLAG; // BPL / BMI
            else if (flag_id == 0x1) flag = CPU.V_FLAG; // BVC / BVS
            else if (flag_id == 0x2) flag = CPU.C_FLAG; // BCC / BCS
            else if (flag_id == 0x3) flag = CPU.Z_FLAG; // BNE / BEQ
            // Flag not recognised (somehow???)
            if (flag == null) return null;
            let data = this.relative();
            if (this.get_flag(flag) == flag_val){
                this.prg_counter = data.addr;
                // All branch instruction take the same cycles
                // Takes 1 extra cycle if branch is taken
                return 2 + data.page_crossed + 1;
            }
            this.prg_counter += data.bytes_used + 1;
            return 2 + data.page_crossed;
        }
        // Check for JSR since it's the only addressing instruction which
        // doesn't fit the AAABBBCC pattern
        if (opcode == 0x20){    // JSR
            let data = this.absolute();
            // Check docs as to why this is done
            this.prg_counter += 2;
            // Push high PC
            this.push((this.prg_counter & 0xFF00) >>> 8);
            // Push low PC
            this.push((this.prg_counter & 0x00FF) >>> 0);
            this.prg_counter = data.addr;
            return 6;
        }
        // There are 3 primary groups that are formated in such a way
        // that they're AAABBBCC, where AAA identifies the opcode, BBB
        // is addressing mode and CC the group. Each group of the 
        // 3 groups has a different way of indicating its addressing mode.
        let op_id        = (opcode & 0xE0) >> 5;
        let op_addr_mode = (opcode & 0x1C) >> 2;
        let op_group     = (opcode & 0x03) >> 0;
        let data         = this.group_get_data(op_id, op_addr_mode, op_group);
        // If at any point data is null or any of the functions for executing
        // opcodes in a certain group returns null, it means our opcode is
        // illegal and we should continue down and handle it there
        if (data != null){
            let res = null;
            if      (op_group == 0x1) res = this.exec_group_one(  op_id, op_addr_mode, data);
            else if (op_group == 0x2) res = this.exec_group_two(  op_id, op_addr_mode, data);
            else if (op_group == 0x0) res = this.exec_group_three(op_id, op_addr_mode, data);
            if (res != null) return res;
        }
        // Illegal opcodes
        // These opcodes are not officially documented, but they
        // are used in some games
        // Illegal NOPs
        // Most of these illegal NOPS perform some sort of fetch
        if ((opcode == 0x80) // NOP #i
         || (opcode == 0x82)
         || (opcode == 0x89)
         || (opcode == 0xC2)
         || (opcode == 0xE2)){
            // Useless immediate byte fetch
            this.nes.mmap.get_byte(this.immediate().addr);
            this.prg_counter += 2;
            return 2;
         }
        if ((opcode == 0x04) // NOP zp
         || (opcode == 0x44)
         || (opcode == 0x64)){
            // Useless zero page fetch
            this.nes.mmap.get_byte(this.zero_page().addr);
            this.prg_counter += 2;
            return 3;
         }
        if (opcode == 0x0C){ // NOP abs
            // Useless absolute fetch
            this.nes.mmap.get_byte(this.absolute().addr);
            this.prg_counter += 3;
            return 4;
        }
        if ((opcode == 0x14) // NOP zp, X 
         || (opcode == 0x34)
         || (opcode == 0x54)
         || (opcode == 0x74)
         || (opcode == 0xD4)
         || (opcode == 0xF4)){
            // Fetches both zp and zp, X for some reason
            this.nes.mmap.get_byte(this.zero_page().addr);
            this.nes.mmap.get_byte(this.indexed_zp_x().addr);
            this.prg_counter += 2;
            return 4;
         }
        if ((opcode == 0x1C) // NOP abs, X
         || (opcode == 0x3C)
         || (opcode == 0x5C)
         || (opcode == 0x7C)
         || (opcode == 0xDC)
         || (opcode == 0xFC)){
            let data = this.indexed_abs_x();
            // Fetches from abs, X and abs, X - 256 if a
            // page boundary is crossed, for some reason
            this.nes.mmap.get_byte(data.addr);
            if (data.page_crossed) this.nes.mmap.get_byte((data.addr - 0x100) & 0xFFFF);
            this.prg_counter += 3;
            return 4 + data.page_crossed;
        }
        // These illegal NOPs don't fetch anything, just
        // like the real NOP (0xEA)
        if ((opcode == 0x1A) // NOP
         || (opcode == 0x3A)
         || (opcode == 0x5A)
         || (opcode == 0x7A)
         || (opcode == 0xDA)
         || (opcode == 0xFA)){
            this.prg_counter += 2;
            return 2;
        }
        if (opcode == 0x9C){ // SHY abs, X
            // This opcode is really weird and unstable
            let val = (this.nes.mmap.get_byte(this.prg_counter + 1) + 1) & 0xFF;
            this.nes.mmap.set_byte(this.indexed_abs_x().addr, this.y_reg & val);
            this.prg_counter += 3;
            return 5;
        }
        if (opcode == 0x9E){ // SHX abs, Y
            // Same as the one above but with X and Y switched
            // And yes, it's just as weird and unstable
            let val = (this.nes.mmap.get_byte(this.prg_counter + 1) + 1) & 0xFF;
            this.nes.mmap.set_byte(this.indexed_abs_y().addr, this.x_reg & val);
            this.prg_counter += 3;
            return 5;
        }
        if ((opcode == 0x02) // KIL
         || (opcode == 0x12)
         || (opcode == 0x22)
         || (opcode == 0x32)
         || (opcode == 0x42)
         || (opcode == 0x52)
         || (opcode == 0x62)
         || (opcode == 0x72)
         || (opcode == 0x92)
         || (opcode == 0xB2)
         || (opcode == 0xD2)
         || (opcode == 0xF2)){
            // Processor lockup, we do nothing
            // If needed, we could display a special
            // message on the the screen or do a debug_log
            return 0;
        }
        // Now for the illegal opcodes that follow more of a pattern
        // The all end with the last two bits being 11 and have a
        // very clean and neat pattern for their addressing modes
        // Funnily enough, it's pretty similar to the pattern with the
        // 3 groups above, we can even reuse some of the variables we
        // have already defined, almost kind of like a 4th group
        data = this.group_ill_get_data(op_id, op_addr_mode);
        // The immediate addressing mode is an exception for basically
        // ever opcode, so I'll just handle it in a separate if like this
        if (op_addr_mode == 0x02){
            switch (op_id){
                case 0x00: // ANC
                case 0x01:{
                    // Both 0x0B and 0x2B do the same thing, so I just
                    // cascaded them both into this code block
                    let val = this.acc & this.nes.mmap.get_byte(data.addr);
                    this.set_flag(CPU.Z_FLAG, !val);
                    this.set_flag(CPU.N_FLAG, val & 0x80);
                    // C flag behaves the same as the N flag in this opcode
                    this.set_flag(CPU.C_FLAG, val & 0x80);
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x02:{ // ALR
                    this.acc &= this.nes.mmap.get_byte(data.addr);
                    this.set_flag(CPU.C_FLAG, this.acc & 0x01);
                    this.acc >>>= 1;
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x03:{ // ARR
                    this.acc &= this.nes.mmap.get_byte(data.addr);
                    this.acc = (this.acc >>> 1) | (this.get_flag(CPU.C_FLAG) << 8);
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    // Some weird behaviour with C and V flag
                    this.set_flag(CPU.C_FLAG, this.acc & 0x40);
                    this.set_flag(CPU.V_FLAG, this.acc & 0x20);
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x04:{ // XAA
                    // Highly, HIGHLY unstable opcode
                    // Should never be used and expected to deliver a
                    // consistent result
                    // In theory, it does the following:
                    // (ACC OR CONST) AND X AND #i -> ACC
                    // Where const is a random value influenced by many
                    // factors such as temperature
                    // Const is usually a value like 0x00, 0xFF, 0xEE
                    // so I'll choose 0xEE for the purpose of this emulator
                    // Doesn't change any flags
                    this.acc = (this.acc | 0xEE) & this.x_reg & this.nes.mmap.get_byte(data.addr);
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x05:{ // LXA
                    // Another VERY unstable opcode involving that magic
                    // constant from earlier
                    // Read the opcode above for very similar info about this one
                    // In theory this should do:
                    // (ACC OR CONST) AND #i -> ACC, X
                    this.acc = (this.acc | 0xEE) & this.nes.mmap.get_byte(data.addr);
                    this.x_reg = this.acc;
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x06:{ // SBX
                    let val = (this.acc & this.x_reg) + ones_comp(this.nes.mmap.get_byte(data.addr)) + 1;
                    this.set_flag(CPU.C_FLAG, val & 0x100);
                    val &= 0xFF;
                    this.set_flag(CPU.N_FLAG, val & 0x80);
                    this.set_flag(CPU.Z_FLAG, !val);
                    this.x_reg = val;
                    this.prg_counter += data.bytes_used + 1;
                    return 2;
                    break;
                }
                case 0x07:{ // USBC
                    // Literally the exact same as normal SBC with
                    // immediate addressing mode
                    let val = ones_comp(this.nes.mmap.get_byte(this.immediate().addr));
                    let result = this.acc + val + this.get_flag(CPU.C_FLAG);
                    this.set_flag(CPU.C_FLAG, result & 0x100);
                    result &= 0xFF;
                    this.set_flag(CPU.N_FLAG, result & 0x80);
                    this.set_flag(CPU.V_FLAG, (this.acc^result) & (val^result) & 0x80);
                    this.set_flag(CPU.Z_FLAG, !result);
                    this.acc = result;
                    this.prg_counter += 2;
                    return 2;
                    break;
                }
            }
        }
        // Finally, we can do some beautiful opcodes implementations
        // with pleasing patterns (there are still a handful of
        // exceptions, though)
        switch (op_id){
            case 0x00:{ // SLO
                let val = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.C_FLAG, val & 0x80);
                val = (val << 1) & 0xFF;
                this.nes.mmap.set_byte(data.addr, val);
                this.acc |= val;
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x01:{ // RLA
                let val = this.nes.mmap.get_byte(data.addr);
                let old_high_bit = val & 0x80;
                val = (val << 1) | this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, old_high_bit);
                this.nes.mmap.set_byte(data.addr, val);
                this.acc &= val;
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x02:{ // SRE
                let val = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.C_FLAG, val & 0x01);
                val >>>= 1;
                this.nes.mmap.set_byte(data.addr, val);
                this.acc ^= val;
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x03:{ // RRA
                let val = this.nes.mmap.get_byte(data.addr);
                let old_low_bit = val & 0x01;
                val = (val >>> 1) | (this.get_flag(CPU.C_FLAG) << 7);
                this.set_flag(CPU.C_FLAG, old_low_bit);
                this.nes.mmap.set_byte(data.addr, val);
                let result = this.acc + val + this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.V_FLAG, (this.acc^result) & (val^result) & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.acc = result;
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x04:{ // SAX
                // This opcode has a couple other exceptions apart from the
                // immediate addressing mode one
                if ((op_addr_mode == 0x04) || (op_addr_mode == 0x07)){ // AHX
                    // Kind of unstable in real hardware, but I will
                    // implement what should theoritically happen
                    let val = this.acc & this.x_reg & (this.nes.mmap.get_byte(this.prg_counter + 1) + 1);
                    this.nes.mmap.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return data.cycles;
                    break;
                }
                if (op_addr_mode == 0x06){ // TAS
                    // Weird and unstable opcode, but again, I'll
                    // implement what is supposed to happen in theory
                    this.stack_ptr = this.acc & this.x_reg;
                    let val = this.stack_ptr & (this.nes.mmap.get_byte(this.prg_counter + 1) + 1);
                    this.nes.mmap.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    // Hardcoding this exception with only one
                    // addressing mode to take a bit of workload off
                    // group_ill_get_data()
                    return 3;
                    break;
                }
                this.nes.mmap.set_byte(data.addr, this.acc & this.x_reg);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x05:{ // LAX
                // This opcode has another exception apart from the
                // one with the immediate addressing mode we covered earlier
                if (op_addr_mode == 0x06){ // LAS
                    // Just plain weird opcode and frankly useless for any
                    // actual coding purpose
                    let val = this.nes.mmap.get_byte(data.addr) & this.stack_ptr;
                    this.acc = val;
                    this.x_reg = val;
                    this.stack_ptr = val;
                    this.prg_counter += data.bytes_used + 1;
                    return data.cycles;
                    break;
                }
                this.acc = this.nes.mmap.get_byte(data.addr);
                this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                this.set_flag(CPU.Z_FLAG, !this.acc);
                this.x_reg = this.acc;
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x06:{ // DCP
                this.nes.mmap.set_byte(data.addr, (this.nes.mmap.get_byte(data.addr) - 1) & 0xFF);
                let val = this.nes.mmap.get_byte(data.addr);
                let result = this.acc + ones_comp(val) + 1;
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
                break;
            }
            case 0x07:{ // ISC
                this.nes.mmap.set_byte(data.addr, (this.nes.mmap.get_byte(data.addr) + 1) & 0xFF);
                let val = ones_comp(this.nes.mmap.get_byte(data.addr));
                let result = this.acc + val + this.get_flag(CPU.C_FLAG);
                this.set_flag(CPU.C_FLAG, result & 0x100);
                result &= 0xFF;
                this.set_flag(CPU.N_FLAG, result & 0x80);
                this.set_flag(CPU.V_FLAG, (this.acc^result) & (val^result) & 0x80);
                this.set_flag(CPU.Z_FLAG, !result);
                this.acc = result;
                this.prg_counter += data.bytes_used + 1;
                return data.cycles;
            }
        }
        // Instruction not found (somehow?!)
        debug_log("Opcode not found");
        return 0;
    }
}
