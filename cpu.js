// DOCS:
// https://llx.com/Neil/a2/opcodes.html
// https://www.cpu-world.com/Arch/650x.html
// https://www.pagetable.com/c64ref/6502/?tab=2#
// https://www.nesdev.org/wiki/CPU_ALL
// https://www.nesdev.org/wiki/CPU_interrupts

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
    // discarded when restored (?)
    static B_FLAG = 0x4;
    static V_FLAG = 0x6;
    static N_FLAG = 0x7;
    
    constructor(){
        this.acc         = 0x00;
        this.x_reg       = 0x00;
        this.y_reg       = 0x00;
        this.proc_status = 0x34;
        // Stack pointer is actually an 8bit register
        // but the stack is located in 0x0100 - 0x01FF
        // so we need to offset it by 0x0100 when we use it
        this.stack_ptr   = 0xFF;
        this.prg_counter = 0x0000;
    }

    push(val){
        MMAP.set_byte(0x0100 + this.stack_ptr, val);
        // Since the MOS 6502 was so cheap, the stack
        // pointer didn't have logic to handle overflow
        // or underflow, as such, it wraps around
        this.stack_ptr = (this.stack_ptr - 1) & 0xFF;
    }

    pop(){
        let val = MMAP.get_byte(0x0100 + this.stack_ptr+1);
        // Reason for this stated above
        this.stack_ptr = (this.stack_ptr + 1) & 0xFF;
        return val;
    }

    get_flag(pos){
        return (this.proc_status & (1<<pos)) >> pos;
    }

    set_flag(pos, val){
        //!! There is probably a better way to do this
        // Make val 0 or 1 depending on if it's truthy or not
        // to make code more compact when setting flags
        let flag_bit = (!!val) << pos;
        // Create base which is identical to current proc_status
        // except the flag bit is always 0
        let base = (~(1 << pos)) & this.proc_status;
        // Finally add in the flag bit if it's 1
        this.proc_status = base | flag_bit;
    }

    immediate(){
        // Second byte of instruction is the data itself
        return {bytes_used: 1, addr: this.prg_counter+1};
    }
    
    absolute(){
        // Second and third bytes of instruction are a 16bit pointer
        // to the data
        let ptr = (MMAP.get_byte(this.prg_counter+2) << 8) | MMAP.get_byte(this.prg_counter+1);
        return {bytes_used: 2, addr: ptr};
    }

    zero_page(){
        // Second byte of instruction points to data in zero-page
        return {bytes_used: 1, addr: MMAP.get_byte(this.prg_counter+1)};
    }

    indexed_zp_x(){ // addr8, X
        // Second byte of instruction gets the contents of X added to it
        // (carry is ignored) and the resulting pointer points to the data
        // in the zero-page
        let zp_ptr = (MMAP.get_byte(this.prg_counter+1) + this.x_reg) & 0x0FF;
        return {bytes_used: 1, addr: zp_ptr};
    }

    indexed_zp_y(){ // addr8, Y
        // Second byte of instruction gets the contents of Y added to it
        // (carry is ignored) and the resulting pointer points to the data
        // in the zero-page
        let zp_ptr = (MMAP.get_byte(this.prg_counter+1) + this.y_reg) & 0x0FF;
        return {bytes_used: 1, addr: zp_ptr};
    }

    indexed_abs_x(){ // addr16, X
        // Second and third byte of instruction get contents of X added to
        // them and the resulting pointer points to the data (I'm ingoring
        // carry but I don't know if that's how it's done)
        let ptr = (MMAP.get_byte(this.prg_counter+2) << 8) | MMAP.get_byte(this.prg_counter+1);
        let indexed_ptr = (ptr + this.x_reg) & 0x0FFFF;
        return {bytes_used: 2, addr: indexed_ptr};
    }

    indexed_abs_y(){ // addr16, Y
        // Second and third byte of instruction get contents of Y added to
        // them and the resulting pointer points to the data (I'm ingoring
        // carry but I don't know if that's how it's done)
        let ptr = (MMAP.get_byte(this.prg_counter+2) << 8) | MMAP.get_byte(this.prg_counter+1);
        let indexed_ptr = (ptr + this.y_reg) & 0x0FFFF;
        return {bytes_used: 2, addr: indexed_ptr};
    }

    relative(){
        // Returns the current program counter shifter by the signed byte
        // in the second byte of the instruction
        // Explanation as to why that signs the bit:
        // https://blog.vjeux.com/2013/javascript/conversion-from-uint8-to-int8-x-24.html
        let signed_offset = MMAP.get_byte(this.prg_counter+1) << 24 >> 24;
        // Behaviour goes crazy when the subtraction returns a negative number
        // but that should never happen (carry is ignored, so going over is no problem)
        // carry but I don't know if that's how it's done)
        let ptr = (MMAP.get_byte(this.prg_counter+2) << 8) | MMAP.get_byte(this.prg_counter+1);
        let indexed_ptr = (ptr + this.y_reg) & 0x0FFFF;
        return {bytes_used: 2, addr: indexed_ptr};
    }

    relative(){
        // Returns the current program counter shifter by the signed byte
        // in the second byte of the instruction
        // Explanation as to why that signs the bit:
        // https://blog.vjeux.com/2013/javascript/conversion-from-uint8-to-int8-x-24.html
        let signed_offset = MMAP.get_byte(this.prg_counter+1) << 24 >> 24;
        // Behaviour goes crazy when the subtraction returns a negative number
        // but that should never happen (carry is ignored, so going over is no problem)
        return {bytes_used: 2, addr: ((this.prg_counter + signed_offset) & 0x0FFFF)};
    }

    indexed_indirect(){ // (addr8, X)
        // Pointer to 16bit pointer stored in the zero-page
        let zp_ptr = (MMAP.get_byte(this.prg_counter+1) + this.xreg) & 0x0FF;
        // 16bit pointer to data in memory
        let true_ptr = (MMAP.get_byte(zp_ptr + 1) << 8) | MMAP.get_byte(zp_ptr);
        return {bytes_used: 1, addr: true_ptr};
    }

    indirect_indexed(){ // (addr8), Y
        // Second byte of instruction points to 16bit pointer in zero-page
        let zp_ptr = MMAP.get_byte(this.prg_counter+1);
        // Retrieve said pointer
        let true_ptr = (MMAP.get_byte(zp_ptr + 1) << 8) | MMAP.get_byte(zp_ptr);
        // Add contents of y_reg to get final pointer
        // (I'm ignoring the carry but I'm not quite sure if that's necessary
        // or if it's different)
        let indexed_ptr = (true_ptr + this.y_reg) & 0x0FFFF;
        return {bytes_used: 1, addr: indexed_ptr};
    }

    absolute_indirect(){ // (addr16)
        // Second and third bytes of instruction point to a location
        // in memory where a 16bit pointer is located which points to
        // the data
        let indirect_ptr = (MMAP.get_byte(this.prg_counter+2) << 8) | MMAP.get_byte(this.prg_counter+1);
        let true_ptr =     (MMAP.get_byte(indirect_ptr+1)     << 8) | MMAP.get_byte(indirect_ptr);
        return {bytes_used: 2, addr: true_ptr};
    }

    group_get_data(addr_mode, group){
        if (group == 0x1){
            switch (addr_mode){
                case 0x0:
                    return this.indexed_indirect();
                case 0x1:
                    return this.zero_page();
                case 0x2:
                    return this.immediate();
                case 0x3:
                    return this.absolute();
                case 0x4:
                    return this.indirect_indexed();
                case 0x5:
                    return this.indexed_zp_x();
                case 0x6:
                    return this.indexed_abs_y();
                case 0x7:
                    return this.indexed_abs_x();
            }
        }
        else if (group == 0x2){
            switch (addr_mode){
                case 0x0:
                    return this.immediate();
                case 0x1:
                    return this.zero_page();
                case 0x2:
                    // Accumulator mode uses the accumulator
                    // itself as the data, so it makes no sense
                    // to give back the usual object, the
                    // opcodes should handle this exception themselves
                    return null;
                case 0x3:
                    return this.absolute();
                case 0x5:
                    return this.indexed_zp_x();
                case 0x7:
                    return this.indexed_abs_x();
            }
        }
        else if (group == 0x0){
            switch(addr_mode){
                case 0x0:
                    return this.immediate();
                case 0x1:
                    return this.zero_page();
                case 0x3:
                    return this.absolute();
                case 0x5:
                    return this.indexed_zp_x();
                case 0x7:
                    return this.indexed_abs_x();
            }
        }
        // Addressing mode not found
        return null;
    }

    emulate_cycle(){
        let opcode = MMAP.get_byte(this.prg_counter);
        // Check for all the single byte instructions since they don't really
        // fit any pattern
        if (opcode == 0x00){ // BRK
            // Read docs as to why this happens
            this.prg_counter += 2;
            // Push high PC
            this.push((this.prg_counter & 0xFF00) >>> 8);
            // Push low PC
            this.push((this.prg_counter & 0x00FF) >>> 0);
            // Push proc status with B_FLAG set for some goddamn reason???
            this.set_flag(B_FLAG, 1);
            this.push(this.proc_status);
            // Again, I guess this is how it's done???
            // Interrupts are confusing as hell
            this.set_flag(I_FLAG, 1);
            this.prg_counter = (MMAP.get_byte(0xFFFF) << 8) | MMAP.get_byte(0xFFFE);
            return;
        }
        if (opcode == 0x40){ // RTI
            this.proc_status = this.pop();
            // Make sure order of operations doesn't mess us up
            this.prg_counter = 0x0000;
            this.prg_counter |= this.pop();
            this.prg_counter |= this.pop() << 8;
            return;
        }
        if (opcode == 0x60){ // RTS
            // Make sure order of operations doesn't mess up
            this.prg_counter = 0x0000;
            this.prg_counter |= this.pop();
            this.prg_counter |= this.pop();
            // Read docs as to why this happens
            this.prg_counter++;
            return;
        }
        if (opcode == 0x08){ // PHP
            this.push(this.proc_status);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x28){ // PLP
            this.proc_status = this.pop();
            this.prg_counter++;
            return;
        }
        if (opcode == 0x48){ // PHA
            this.push(this.acc);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x68){ // PLA
            this.acc = this.pop();
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x88){ // DEY
            this.y_reg = (this.y_reg - 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xA8){ // TAY
            this.y_reg = this.acc;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xC8){ // INY
            this.y_reg = (this.y_reg + 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.y_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xE8){ // INX
            this.x_reg = (this.x_reg + 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x18){ // CLC
            this.set_flag(CPU.C_FLAG, 0);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x38){ // SEC
            this.set_flag(CPU.C_FLAG, 1);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x58){ // CLI
            this.set_flag(CPU.I_FLAG, 0);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x78){ // SEI
            this.set_flag(CPU.I_FLAG, 1);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x98){ // TYA
            this.acc = this.y_reg;
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xB8){ // CLV
            this.set_flag(CPU.V_FLAG, 0);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xD8){ // CLD
            this.set_flag(CPU.D_FLAG, 0);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xF8){ // SED
            this.set_flag(CPU.D_FLAG, 1);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x8A){ // TXA
            this.acc = this.x_reg;
            this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.acc);
            this.prg_counter++;
            return;
        }
        if (opcode == 0x9A){ // TSX
            this.x_reg = this.stack_ptr;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xAA){ // TAX
            this.x_reg = this.acc;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            this.prg_counter++;
            return;
        }
        if (opcode == 0xBA){ // TSX
            this.stack_ptr = this.x_reg;
            this.prg_counter++;
            return;
        }
        if (opcode == 0xCA){ // DEX
            this.x_reg = (this.x_reg - 1) & 0xFF;
            this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
            this.set_flag(CPU.Z_FLAG, !this.x_reg);
            return;
        }
        if (opcode == 0xEA){ // NOP
            // Lmao what do you want me to do bruhhhhhh
            return;
        }
        // Check for JMP instruction (since it's a bit iffy when you try
        // to fit it with the other groups)
        if (opcode == 0x4C){ // JMP (Absolute)
            let data = this.absolute();
            this.prg_counter = data.addr;
            return;
        }
        if (opcode == 0x6C){ // JMP (Absolute Indirect)
            let data = this.absolute_indirect();
            this.prg_counter = data.addr;
            return;
        }
        // Check for branch instructions. They are formatted so that
        // they're XXY10000, where XX indicates the flag to check and
        // Y represents the value to check it against
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
            let data = this.relative().addr;
            if (this.get_flag(flag) == flag_val){
                this.prg_counter = data.addr;
                return;
            }
            this.prg_counter += data.bytes_used + 1;
            return;
        }
        // Check for JSR since it's the only addressing instruction which
        // doesn't fit the AAABBBCC pattern
        if (opcode == 0x20){    // JSR
            let new_addr = absolute().addr;
            // Check docs as to why this is done
            this.prg_counter += 2;
            // Push high PC
            this.push((this.prg_counter & 0xFF00) >>> 8);
            // Push low PC
            this.push((this.prg_counter & 0x00FF) >>> 0);
            this.prg_counter = new_addr;
            return;
        }
        // There are 3 primary groups are formated in such a way that
        // they're AAABBBCC, where AAA identifies the opcode, BBB
        // its addressing mode and CC the group. Each group of the 
        // 3 groups has a different way of indicating its addressing mode.
        let op_id        = (opcode & 0xE0) >> 5;
        let op_addr_mode = (opcode & 0x1C) >> 2;
        let op_group     = (opcode & 0x03) >> 0;
        // Group 1
        if (op_group == 0x1){
            let data = this.group_get_data(op_addr_mode, 0x1);
            switch (op_id){
                case 0x0: // ORA
                    this.acc |= MMAP.get_byte(data.addr);
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    return;
                case 0x1: // AND
                    this.acc &= MMAP.get_byte(data.addr);
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x2: // EOR
                    this.acc ^= MMAP.get_byte(data.addr);
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x3: // ADC
                    let old_sign_bit = this.acc & 0x80;
                    this.acc += MMAP.get_byte(data.addr) + this.get_flag(CPU.C_FLAG);
                    this.set_flag(CPU.C_FLAG,  this.acc > 0xFF);
                    this.acc &= 0xFF;
                    this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
                    this.set_flag(CPU.V_FLAG, (this.acc & 0x80) != old_sign_bit);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x4: // STA
                    // Only exception in group 1, since STA needs an
                    // actual memory address to store the accumulator,
                    // using immediate addressing mode makes no sense
                    if (op_addr_mode == 0x2) return null;
                    MMAP.set_byte(data.addr, this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x5: // LDA
                    this.acc = MMAP.get_byte(data.addr);
                    this.set_flag(CPU.N_FLAG, this.acc & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x6: // CMP
                    // & 0xFF at the end because of weird casting signed/unsigned stuff
                    let result = (this.acc - MMAP.get_byte(data.addr)) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  result & 0x80);
                    this.set_flag(CPU.Z_FLAG, !result);
                    this.set_flag(CPU.C_FLAG,  this.acc >= MMAP.get_byte(data.addr));
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x7: // SBC
                    let old_sign_bit = this.acc & 0x80;
                    let subtrahend = MMAP.get_byte(data.addr) + this.get_flag(CPU.C_FLAG);
                    this.set_flag(CPU.C_FLAG,  this.acc >= subtrahend);
                    // & 0xFF at the end because of weird casting signed/unsigned stuff
                    this.acc = (this.acc - subtrahend) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
                    this.set_flag(CPU.V_FLAG, (this.acc & 0x80) != old_sign_bit);
                    this.set_flag(CPU.Z_FLAG, !this.acc);
                    this.prg_counter += data.bytes_used + 1;
                    return;
            }
        }
        // Group 2
        if (op_group == 0x2){
            let data = this.group_get_data(op_addr_mode, 0x2);
            switch (op_id){
                case 0x0: // ASL
                    // Immediate addressing mode not allowed
                    if (op_addr_mode == 0x0) return null;
                    else if (op_addr_mode == 0x2){
                        // Shift accumulator if addressing mode
                        // is accumulator
                        this.set_flag(CPU.C_FLAG,  this.acc & 0x80);
                        this.acc <<= 1;
                        this.set_flag(CPU.Z_FLAG, !this.acc);
                        this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
                        this.prg_counter += data.bytes_used + 1;
                        return;
                    }
                    // Otherwise shift memory
                    let val = MMAP.get_byte(data.addr);
                    this.set_flag(CPU.C_FLAG,  val & 0x80);
                    val <<= 1;
                    this.set_flag(CPU.Z_FLAG, !val);
                    this.set_flag(CPU.N_FLAG,  val & 0x80);
                    MMAP.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x1: // ROL
                    // Immediate addressing mode not allowed
                    if (op_addr_mode == 0x0) return null;
                    else if (op_addr_mode == 0x2){
                        // Same as before
                        let high_bit = this.acc & 0x80;
                        this.acc = (this.acc << 1) | this.get_flag(CPU.C_FLAG);
                        this.set_flag(CPU.C_FLAG,  high_bit);
                        this.set_flag(CPU.Z_FLAG, !this.acc);
                        this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
                        this.prg_counter += data.bytes_used + 1;
                        return;
                    }
                    let val = MMAP.get_byte(data.addr);
                    let high_bit = val & 0x80;
                    val = (val << 1) | this.get_flag(CPU.C_FLAG);
                    this.set_flag(CPU.C_FLAG,  high_bit);
                    this.set_flag(CPU.Z_FLAG, !val);
                    this.set_flag(CPU.N_FLAG,  val & 0x80);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x2: // LSR
                    // Immediate addressing mode not allowed
                    if (op_addr_mode == 0x0) return null;
                    else if (op_addr_mode == 0x2){
                        // Same as before
                        this.set_flag(CPU.C_FLAG,  this.acc & 0x01);
                        this.acc >>>= 1;
                        this.set_flag(CPU.Z_FLAG, !this.acc);
                        // N flag will always be 0 after right shift
                        this.set_flag(CPU.N_FLAG,  0);
                        this.prg_counter += data.bytes_used + 1;
                        return;
                    }
                    let val = MMAP.get_byte(data.addr);
                    this.set_flag(CPU.C_FLAG,  val & 0x01);
                    val >>>= 1;
                    this.set_flag(CPU.Z_FLAG, !val);
                    this.set_flag(CPU.N_FLAG,  0);
                    MMAP.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x3: // ROR
                    // Immediate addressing mode not allowed
                    if (op_addr_mode == 0x0) return null;
                    else if (op_addr_mode == 0x2){
                        // Same as before
                        let low_bit = this.acc & 0x01;
                        this.acc = (this.acc >>> 1) | (this.get_flag(CPU.C_FLAG) << 7);
                        this.set_flag(CPU.C_FLAG,  low_bit);
                        this.set_flag(CPU.N_FLAG,  this.acc & 0x80);
                        this.set_flag(CPU.Z_FLAG, !this.acc);
                        this.prg_counter += data.bytes_used + 1;
                        return;
                    }
                    let val = MMAP.get_byte(data.addr);
                    let low_bit = val & 0x01;
                    val = (val >>> 1) | (this.get_flag(CPU.C_FLAG) << 7);
                    this.set_flag(CPU.C_FLAG,  low_bit);
                    this.set_flag(CPU.N_FLAG,  val & 0x80);
                    this.set_flag(CPU.Z_FLAG, !val);
                    MMAP.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                // These four next instruction don't support accumulator
                // mode so no need to worry about that exception
                case 0x4: // STX
                    // Absolute indexed, immediate, accumulator addressing
                    // modes not allowed in this instrucion
                    if ((op_addr_mode == 0x7)
                      ||(op_addr_mode == 0x0)
                      ||(op_addr_mode == 0x2)) return null;
                    // addr8, X becomes addr8, Y with this instruction
                    else if (op_addr_mode == 0x5) data = this.indexed_zp_y();
                    MMAP.set_byte(data.addr, this.x_reg);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x5: // LDX
                    // Accumulator addressing mode not allowed
                    if (op_addr_mode == 0x2) return null;
                    // addr8, X becomes addr8, Y
                    else if (op_addr_mode == 0x5) data = this.indexed_zp_y();
                    // addr16, X becomes addr16, Y
                    else if (op_addr_mode == 0x7) data = this.indexed_abs_y();
                    this.x_reg = MMAP.get_byte(data.addr);
                    this.set_flag(CPU.Z_FLAG, !this.x_reg);
                    this.set_flag(CPU.N_FLAG,  this.x_reg & 0x80);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x6: // DEC
                    // Immediate and accumulator addressing modes not allowed
                    if ((op_addr_mode == 0x0)
                      ||(op_addr_mode == 0x2)) return null;
                    let val = MMAP.get_byte(data.addr);
                    val = (val - 1) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  val & 0x80);
                    this.set_flag(CPU.Z_FLAG, !val);
                    MMAP.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x7: // INC
                    // Immediate and accumulator addressing modes not allowed
                    if ((op_addr_mode == 0x0)
                      ||(op_addr_mode == 0x2)) return null;
                    let val = MMAP.get_byte(data.addr);
                    val = (val + 1) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  val & 0x80);
                    this.set_flag(CPU.Z_FLAG, !val);
                    MMAP.set_byte(data.addr, val);
                    this.prg_counter += data.bytes_used + 1;
                    return;
            }
        }
        // Group 3
        if (op_group == 0x0){
            let data = group_get_data(op_addr_mode, 0x0);
            switch (op_id){
                case 0x1: // BIT
                    // This is such a weird instruction
                    // Immediate, zero page indexed, absolute indexed addressing
                    // modes not allowed for this instruction
                    if ((op_addr_mode == 0x0)
                      ||(op_addr_mode == 0x4)
                      ||(op_addr_mode == 0x5)) return null;
                    let val = MMAP.get_byte(data.addr);
                    // I think this is how it's done, but it could
                    // be that its the 7th and 6th bits of the RESULT
                    // of the and between the data and accumulator
                    this.set_flag(CPU.N_FLAG, val & 0x80);
                    this.set_flag(CPU.V_FLAG, val & 0x40);
                    // This one I'm sure of though
                    this.set_flag(CPU.Z_FLAG, !(val & this.acc));
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x4: // STY
                    // Immediate and absolute indexed addressing modes
                    // not allowed for this intruction
                    if ((op_addr_mode == 0x0)
                      ||(op_addr_mode == 0x7)) return null;
                    MMAP.set_byte(data.addr, this.y_reg);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x5: // LDY
                    this.y_reg = MMAP.get_byte(data.addr);
                    this.set_flag(CPU.N_FLAG,  this.y_reg & 0x80);
                    this.set_flag(CPU.Z_FLAG, !this.y_reg);
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x6: // CPY
                    // Zero page indexed, absolute indexed addressing
                    // modes not allowed for this instruction
                    if ((op_addr_mode == 0x4)
                      ||(op_addr_mode == 0x5)) return null;
                    // & 0xFF at the end because of weird casting signed/unsigned stuff
                    let result = (this.y_reg - MMAP.get_byte(data.addr)) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  result & 0x80);
                    this.set_flag(CPU.Z_FLAG, !result);
                    this.set_flag(CPU.C_FLAG,  this.y_reg >= MMAP.get_byte(data.addr));
                    this.prg_counter += data.bytes_used + 1;
                    return;
                case 0x7: // CPX
                    // Zero page indexed, absolute indexed addressing
                    // modes not allowed for this instruction
                    if ((op_addr_mode == 0x4)
                      ||(op_addr_mode == 0x5)) return null;
                    // & 0xFF at the end because of weird casting signed/unsigned stuff
                    let result = (this.x_reg - MMAP.get_byte(data.addr)) & 0xFF;
                    this.set_flag(CPU.N_FLAG,  result & 0x80);
                    this.set_flag(CPU.Z_FLAG, !result);
                    this.set_flag(CPU.C_FLAG,  this.x_reg >= MMAP.get_byte(data.addr));
                    this.prg_counter += data.bytes_used + 1;
                    return;
            }
        }
        // Instruction not found
        return null;
    }
}

