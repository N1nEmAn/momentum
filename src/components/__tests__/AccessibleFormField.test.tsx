import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessibleFormField } from '../AccessibleFormField';

describe('AccessibleFormField', () => {
  describe('Accessibility Compliance', () => {
    it('should have proper label association for text input', () => {
      render(
        <AccessibleFormField
          id="test-input"
          label="Test Label"
          type="text"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      const label = screen.getByText('Test Label');

      expect(input).toHaveAttribute('id', 'test-input');
      expect(label).toHaveAttribute('for', 'test-input');
    });

    it('should have proper label association for select', () => {
      render(
        <AccessibleFormField
          id="test-select"
          label="Test Select"
          type="select"
          value=""
          onChange={() => {}}
          options={[
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' }
          ]}
        />
      );

      const select = screen.getByRole('combobox');
      const label = screen.getByText('Test Select');

      expect(select).toHaveAttribute('id', 'test-select');
      expect(label).toHaveAttribute('for', 'test-select');
    });

    it('should have proper label association for textarea', () => {
      render(
        <AccessibleFormField
          id="test-textarea"
          label="Test Textarea"
          type="textarea"
          value=""
          onChange={() => {}}
        />
      );

      const textarea = screen.getByRole('textbox');
      const label = screen.getByText('Test Textarea');

      expect(textarea).toHaveAttribute('id', 'test-textarea');
      expect(label).toHaveAttribute('for', 'test-textarea');
    });

    it('should have proper checkbox labeling', () => {
      render(
        <AccessibleFormField
          id="test-checkbox"
          label="Test Checkbox"
          type="checkbox"
          value={false}
          onChange={() => {}}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      const label = screen.getByText('Test Checkbox');

      expect(checkbox).toHaveAttribute('id', 'test-checkbox');
      expect(label).toBeInTheDocument();
    });

    it('should indicate required fields with asterisk', () => {
      render(
        <AccessibleFormField
          id="required-field"
          label="Required Field"
          type="text"
          required={true}
          value=""
          onChange={() => {}}
        />
      );

      const label = screen.getByText('Required Field');
      expect(label).toHaveClass('after:content-[\'*\']');
    });

    it('should have proper ARIA attributes for description', () => {
      render(
        <AccessibleFormField
          id="described-field"
          label="Field with Description"
          type="text"
          description="This is a helpful description"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      const description = screen.getByText('This is a helpful description');

      expect(input).toHaveAttribute('aria-describedby', 'described-field-description');
      expect(description).toHaveAttribute('id', 'described-field-description');
    });

    it('should have proper ARIA attributes for error state', () => {
      render(
        <AccessibleFormField
          id="error-field"
          label="Field with Error"
          type="text"
          error="This field has an error"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      const errorMessage = screen.getByText('This field has an error');

      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'error-field-error');
      expect(errorMessage).toHaveAttribute('id', 'error-field-error');
      expect(errorMessage).toHaveAttribute('role', 'alert');
    });

    it('should combine description and error in aria-describedby', () => {
      render(
        <AccessibleFormField
          id="complex-field"
          label="Complex Field"
          type="text"
          description="Field description"
          error="Field error"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'complex-field-description complex-field-error');
    });

    it('should have proper name attribute', () => {
      render(
        <AccessibleFormField
          id="named-field"
          name="customName"
          label="Named Field"
          type="text"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('name', 'customName');
    });

    it('should use id as name when name is not provided', () => {
      render(
        <AccessibleFormField
          id="auto-named-field"
          label="Auto Named Field"
          type="text"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('name', 'auto-named-field');
    });
  });

  describe('Functionality', () => {
    it('should call onChange with correct value for text input', () => {
      const mockOnChange = jest.fn();
      render(
        <AccessibleFormField
          id="text-field"
          label="Text Field"
          type="text"
          value=""
          onChange={mockOnChange}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test value' } });

      expect(mockOnChange).toHaveBeenCalledWith('test value');
    });

    it('should call onChange with correct value for number input', () => {
      const mockOnChange = jest.fn();
      render(
        <AccessibleFormField
          id="number-field"
          label="Number Field"
          type="number"
          value={0}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByRole('spinbutton');
      fireEvent.change(input, { target: { value: '42' } });

      expect(mockOnChange).toHaveBeenCalledWith(42);
    });

    it('should call onChange with correct value for checkbox', () => {
      const mockOnChange = jest.fn();
      render(
        <AccessibleFormField
          id="checkbox-field"
          label="Checkbox Field"
          type="checkbox"
          value={false}
          onChange={mockOnChange}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      expect(mockOnChange).toHaveBeenCalledWith(true);
    });

    it('should call onChange with correct value for select', () => {
      const mockOnChange = jest.fn();
      render(
        <AccessibleFormField
          id="select-field"
          label="Select Field"
          type="select"
          value=""
          onChange={mockOnChange}
          options={[
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' }
          ]}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'option2' } });

      expect(mockOnChange).toHaveBeenCalledWith('option2');
    });

    it('should handle disabled state correctly', () => {
      render(
        <AccessibleFormField
          id="disabled-field"
          label="Disabled Field"
          type="text"
          disabled={true}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should handle required state correctly', () => {
      render(
        <AccessibleFormField
          id="required-field"
          label="Required Field"
          type="text"
          required={true}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });
  });

  describe('Visual States', () => {
    it('should apply error styling when error is present', () => {
      render(
        <AccessibleFormField
          id="error-field"
          label="Error Field"
          type="text"
          error="Error message"
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-red-500');
    });

    it('should apply disabled styling when disabled', () => {
      render(
        <AccessibleFormField
          id="disabled-field"
          label="Disabled Field"
          type="text"
          disabled={true}
          value=""
          onChange={() => {}}
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });
});