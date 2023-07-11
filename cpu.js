// DOCS:
// https://llx.com/Neil/a2/opcodes.html
// https://www.cpu-world.com/Arch/650x.html
// https://www.pagetable.com/c64ref/6502/?tab=2#

// IMPORTANT NOTE TO SELF:
// Even though the MOS6502/Ricoh2A03 are little-endian, the opcode identifier
// goes first (lower address) in the ROM, followed by the operands

class CPU{
	constructor(){
		this.acc         = 0x00;
		this.x_reg       = 0x00;
		this.y_reg       = 0x00;
		this.proc_status = 0x00;
		this.prg_counter = 0x0000;
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
		// Add contents of y_reg to it and retrieve data in resulter pointer
		// (I'm ignoring the carry but I'm not quite sure if that's necessary
		// or if it's different)
		let indexed_ptr = (true_ptr + this.y_reg) & 0x0FFFF;
		return {bytes_used: 1, addr: indexed_ptr};
	}

	group_get_data(addr_mode, group){
		if (group == 0x1){
			switch (addr_mode){
				case 0x0:
					return indexed_indirect();
				case 0x1:
					return zero_page();
				case 0x2:
					return immediate();
				case 0x3:
					return absolute();
				case 0x4:
					return indirect_indexed();
                case 0x5:
                    return indexed_zp_x();
                case 0x6:
                    return indexed_abs_y();
                case 0x7:
                    return indexed_abs_x();
			}
		}
        return null;
	}

	emulate_cycle(){
		let opcode       = MMAP.get_byte(this.prg_counter);
		// Check for all the single byte instructions since they don't really
		// fit any pattern
		if (opcode == 0x00){ // BRK
			return;
		}
		if (opcode == 0x40){ // RTI
			return;
		}
		if (opcode == 0x60){ // RTS
			return;
		}
		if (opcode == 0x08){ // PHP
			return;
		}
		if (opcode == 0x28){ // PLP
			return;
		}
		if (opcode == 0x48){ // PHA
			return;
		}
		if (opcode == 0x68){ // PLA
			return;
		}
		if (opcode == 0x88){ // DEY
			return;
		}
		if (opcode == 0xA8){ // TAY
			return;
		}
		if (opcode == 0xC8){ // INY
			return;
		}
		if (opcode == 0xE8){ // INX
			return;
		}
		if (opcode == 0x18){ // CLC
			return;
		}
		if (opcode == 0x38){ // SEC
			return;
		}
		if (opcode == 0x58){ // CLI
			return;
		}
		if (opcode == 0x78){ // SEI
			return;
		}
		if (opcode == 0x98){ // TYA
			return;
		}
		if (opcode == 0xB8){ // CLV
			return;
		}
		if (opcode == 0xD8){ // CLD
			return;
		}
		if (opcode == 0xF8){ // SED
			return;
		}
		if (opcode == 0x8A){ // TXA
			return;
		}
		if (opcode == 0x9A){ // TXS
			return;
		}
		if (opcode == 0xAA){ // TAX
			return;
		}
		if (opcode == 0xBA){ // TSX
			return;
		}
		if (opcode == 0xCA){ // DEX
			return;
		}
		if (opcode == 0xEA){ // NOP
			return;
		}
		// Check for JMP instruction (since it's a bit iffy when you try
		// to fit it with the other groups)
		if (opcode == 0x4C){ // JMP (Absolute)
			return;
		}
		if (opcode == 0x6C){ // JMP (Absolute Indirect)
			return;
		}
		// Check for branch instructions. They are formatted so that
		// they're XXY10000, where XX indicates the flag to check and
		// Y represents the value to check it against
		if ((opcode & 0x1F) == 0x10){
			let flag_id  = (opcode & 0xC0) >> 6;
			let flag_val = (opcode & 0x20) >> 5;
			if (flag_val == 0x00){ // BPL / BMI
				return;
			}
			if (flag_val == 0x01){ // BVC / BVS
				return;
			}
			if (flag_val == 0x10){ // BCC / BCS
				return;
			}
			if (flag_val == 0x11){ // BNE / BEQ
				return;
			}
		}
		// Check for JSR since it's the only addressing instruction which
		// doesn't fit the AAABBBCC pattern
		if (opcode == 0x20){	// JSR
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
			switch (op_id){
				case 0x0: // ORA
					return;
				case 0x1: // AND
					return;
				case 0x2: // EOR
					return;
				case 0x3: // ADC
					return;
				case 0x4: // STA
					return;
				case 0x5: // LDA
					return;
				case 0x6: // CMP
					return;
				case 0x7: // SBC
					return;
			}
		}
		// Group 2
		if (op_group == 0x2){
			switch (op_id){
				case 0x0: // ASL
					return;
				case 0x1: // ROL
					return;
				case 0x2: // LSR
					return;
				case 0x3: // ROR
					return;
				case 0x4: // STX
					return;
				case 0x5: // LDX
					return;
				case 0x6: // DEC
					return;
				case 0x7: // INC
					return;
			}
		}
		// Group 3
		if (op_group == 0x0){
			switch (op_id){
				case 0x1: // BIT
					return;
				case 0x4: // STY
					return;
				case 0x5: // LDY
					return;
				case 0x6: // CPY
					return;
				case 0x7: // CPX
					return;
			}
		}
        // Instruction not found
        return null;
	}
}

