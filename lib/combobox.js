/** @jsx React.DOM */

var React      = require('react');
var classnames = require('classnames');

var guid = 0;
var noop = function(){};
var ComboboxOption = require('./option');

module.exports = React.createClass({
  propTypes: {
    /**
     * Defaults to 'both'. 'inline' will autocomplete the first matched Option
     * into the input value, 'list' will display a list of choices, and of
     * course, both does both (do you have a soft 'L' in there when you say
     * "both" out loud?)
    */
    autocomplete: React.PropTypes.oneOf(['both', 'inline', 'list']),

    /**
     * Called when the combobox receives user input, this is your chance to
     * filter the data and rerender the options.
     *
     * Signature:
     *
     * ```js
     * function(userInput){}
     * ```
    */
    onInput: React.PropTypes.func,

    /**
     * Called when the combobox receives a selection. You probably want to reset
     * the options to the full list at this point.
     *
     * Signature:
     *
     * ```js
     * function(selectedValue){}
     * ```
    */
    onSelect: React.PropTypes.func,

    /**
     * The initial value of the component.
    */
    value: React.PropTypes.any,

    /**
     * classes for input
     */
    inputClass: React.PropTypes.string,

    /*
     * Placeholder on input element
     */
    placeholder: React.PropTypes.string,

    /*
     * On complete blur input
     */
    onCompleteBlur: React.PropTypes.bool
  },

  getDefaultProps: function() {
    return {
      autocomplete: 'both',
      placeholder: 'Search',
      onInput: noop,
      onSelect: noop,
      onCompleteBlur: false,
      value: null
    };
  },

  getInitialState: function() {
    var inputClass = 'rf-combobox-input';

    if (this.props.inputClass) {
      inputClass = classnames(inputClass, this.props.inputClass);
    }

    return {
      value: this.props.value,
      // the value displayed in the input
      inputValue: this.findInputValue(),
      isOpen: false,
      focusedIndex: null,
      matchedAutocompleteOption: null,
      // this prevents crazy jumpiness since we focus options on mouseenter
      usingKeyboard: false,
      activedescendant: null,
      listId: 'rf-combobox-list-'+(++guid),
      menu: {
        children: [],
        activedescendant: null,
        isEmpty: true
      },
      inputClass: inputClass
    };
  },

  componentWillMount: function() {
    this.setState({menu: this.makeMenu()});
  },

  componentWillReceiveProps: function(newProps) {
    var states = {
      menu: this.makeMenu(newProps.children)
    }

    if (newProps.value !== this.state.value) {
      states.value = newProps.value;
      states.inputValue = newProps.value;
    }
    
    this.setState(states);
  },

  /**
   * We don't create the <ComboboxOption> components, the user supplies them,
   * so before rendering we attach handlers to facilitate communication from
   * the ComboboxOption to the Combobox.
  */
  makeMenu: function(children) {
    var activedescendant;
    var isEmpty = true;
    children = children || this.props.children;
    React.Children.forEach(children, function(child, index) {
      if (child.type !== ComboboxOption.type)
        // allow random elements to live in this list
        return;
       isEmpty = false;
      // TODO: cloneWithProps and map instead of altering the children in-place
      var props = child.props;
      if (this.state.value === props.value) {
        // need an ID for WAI-ARIA
        props.id = props.id || 'rf-combobox-selected-'+(++guid);
        props.isSelected = true
        activedescendant = props.id;
      }
      props.onBlur = this.handleOptionBlur;
      props.onClick = this.selectOption.bind(this, child);
      props.onFocus = this.handleOptionFocus;
      props.onKeyDown = this.handleOptionKeyDown.bind(this, child);
      props.onMouseEnter = this.handleOptionMouseEnter.bind(this, index);
    }.bind(this));
    return {
      children: children,
      activedescendant: activedescendant,
      isEmpty: isEmpty
    };
  },

  getClassName: function() {
    return classnames(this.props.className, 'rf-combobox', { 'rf-combobox-is-open': this.state.isOpen });
  },

  /**
   * When the user begins typing again we need to clear out any state that has
   * to do with an existing or potential selection.
  */
  clearSelectedState: function(value, cb) {
    this.setState({
      focusedIndex: null,
      inputValue: value || null,
      // value: null,
      matchedAutocompleteOption: null,
      activedescendant: null
    }, cb);
  },

  handleInputChange: function(event) {
    var value = this.refs.input.getDOMNode().value;
    this.clearSelectedState(value, function() {
      this.props.onInput(value);
      if (!this.state.isOpen)
        this.showList();
    }.bind(this));
  },

  handleInputBlur: function() {
    var focusedAnOption = this.state.focusedIndex != null;
    if (focusedAnOption)
      return;
    this.maybeSelectAutocompletedOption();
    this.hideList();
  },

  handleOptionBlur: function() {
    // don't want to hide the list if we focused another option
    this.blurTimer = setTimeout(this.hideList, 0);
  },

  handleOptionFocus: function() {
    // see `handleOptionBlur`
    clearTimeout(this.blurTimer);
  },

  handleInputKeyUp: function(event) {
    if (
      this.state.menu.isEmpty ||
      // autocompleting while backspacing feels super weird, so let's not
      event.keyCode === 8 /*backspace*/ ||
      !this.props.autocomplete.match(/both|inline/)
    ) return;
    this.autocompleteInputValue();
  },

  /**
   * Autocompletes the input value with a matching label of the first
   * ComboboxOption in the list and selects only the fragment that has
   * been added, allowing the user to keep typing naturally.
  */
  autocompleteInputValue: function() {
    if (
      this.props.autocomplete == false ||
      this.props.children.length === 0
    ) return;
    var input = this.refs.input.getDOMNode();
    var inputValue = input.value;
    var firstChild = this.props.children.length ?
      this.props.children[0] :
      this.props.children;
    var label = getLabel(firstChild);
    var fragment = matchFragment(inputValue, label);
    if (!fragment)
      return;
    input.value = label;
    input.setSelectionRange(inputValue.length, label.length);
    this.setState({matchedAutocompleteOption: firstChild});
  },

  handleButtonClick: function() {
    this.state.isOpen ? this.hideList() : this.showList();
    this.focusInput();
  },

  showList: function() {
    if (this.props.autocomplete.match(/both|list/))
      this.setState({isOpen: true});
  },

  hideList: function() {
    this.setState({isOpen: false});
  },

  hideOnEscape: function() {
    this.hideList();
    this.focusInput();
  },

  focusInput: function() {
    this.refs.input.getDOMNode().focus();
  },

  blurInput: function() {
    this.refs.input.getDOMNode().blur();
  },

  selectInput: function() {
    this.refs.input.getDOMNode().select();
  },

  inputKeydownMap: {
    38: 'focusPrevious',
    40: 'focusNext',
    27: 'hideOnEscape',
    13: 'selectOnEnter'
  },

  optionKeydownMap: {
    38: 'focusPrevious',
    40: 'focusNext',
    13: 'selectOption',
    27: 'hideOnEscape'
  },

  handleKeydown: function(event) {
    var handlerName = this.inputKeydownMap[event.keyCode];
    if (!handlerName)
      return
    event.preventDefault();
    this.setState({usingKeyboard: true});
    this[handlerName].call(this);
  },

  handleOptionKeyDown: function(child, event) {
    var handlerName = this.optionKeydownMap[event.keyCode];
    if (!handlerName) {
      // if the user starts typing again while focused on an option, move focus
      // to the input, select so it wipes out any existing value
      this.selectInput();
      return;
    }
    event.preventDefault();
    this.setState({usingKeyboard: true});
    this[handlerName].call(this, child);
  },

  handleOptionMouseEnter: function(index) {
    if (this.state.usingKeyboard)
      this.setState({usingKeyboard: false});
    else
      this.focusOptionAtIndex(index);
  },

  selectOnEnter: function() {
    this.maybeSelectAutocompletedOption();
    this.refs.input.getDOMNode().select();
  },

  maybeSelectAutocompletedOption: function() {
    if (!this.state.matchedAutocompleteOption)
      return;
    this.selectOption(this.state.matchedAutocompleteOption, {focus: false});
  },

  selectOption: function(child, options) {
    options = options || {};
    this.setState({
      value: child.props.value,
      inputValue: getLabel(child),
      matchedAutocompleteOption: null
    }, function() {
      this.props.onSelect(child.props.value, child);
      this.hideList();
      if (options.focus !== false && !this.props.onCompleteBlur) {
        this.selectInput();
      } else if(this.props.onCompleteBlur) {
        this.blurInput();
      }
    }.bind(this));
  },

  focusNext: function() {
    if (this.state.menu.isEmpty) return;
    var index = this.state.focusedIndex == null ?
      0 : this.state.focusedIndex + 1;
    this.focusOptionAtIndex(index);
  },

  focusPrevious: function() {
    if (this.state.menu.isEmpty) return;
    var last = this.props.children.length - 1;
    var index = this.state.focusedIndex == null ?
      last : this.state.focusedIndex - 1;
    this.focusOptionAtIndex(index);
  },

  focusSelectedOption: function() {
    var selectedIndex;
    React.Children.forEach(this.props.children, function(child, index) {
      if (child.props.value === this.state.value)
        selectedIndex = index;
    }.bind(this));
    this.showList();
    this.setState({
      focusedIndex: selectedIndex
    }, this.focusOption);
  },

  findInputValue: function(value) {
    value = value || this.props.value;
    // TODO: might not need this, we should know this in `makeMenu`
    var inputValue;
    React.Children.forEach(this.props.children, function(child) {
      if (child.props.value === value)
        inputValue = getLabel(child);
    });
    return inputValue || value;
  },

  focusOptionAtIndex: function(index) {
    if (!this.state.isOpen && this.state.value)
      return this.focusSelectedOption();
    this.showList();
    var length = this.props.children.length;
    if (index === -1)
      index = length - 1;
    else if (index === length)
      index = 0;
    this.setState({
      focusedIndex: index
    }, this.focusOption);
  },

  focusOption: function() {
    var index = this.state.focusedIndex;
    this.refs.list.getDOMNode().childNodes[index].focus();
  },

  render: function() {
    return (
      <div className={this.getClassName()}>
        <input
          ref="input"
          type="text"
          className={this.state.inputClass}
          defaultValue={this.props.value}
          value={this.state.inputValue}
          onChange={this.handleInputChange}
          onBlur={this.handleInputBlur}
          onFocus={this.handleButtonClick}
          onKeyDown={this.handleKeydown}
          onKeyUp={this.handleInputKeyUp}
          placeholder={this.props.placeholder}
          role="combobox"
          aria-activedescendant={this.state.menu.activedescendant}
          aria-autocomplete={this.props.autocomplete}
          aria-owns={this.state.listId}
        />
        <span
          aria-hidden="true"
          className="rf-combobox-button"
          onClick={this.handleButtonClick}
        >▾</span>
        <div
          id={this.state.listId}
          ref="list"
          className="rf-combobox-list"
          aria-expanded={this.state.isOpen+''}
          role="listbox"
        >{this.state.menu.children}</div>
      </div>
    );
  }
});

function getLabel(component) {
  var hasLabel = component.props.label != null;
  return hasLabel ? component.props.label : component.props.children;
}

function matchFragment(userInput, firstChildLabel) {
  userInput = userInput.toLowerCase();
  firstChildLabel = firstChildLabel.toLowerCase();
  if (userInput === '' || userInput === firstChildLabel)
    return false;
  if (firstChildLabel.toLowerCase().indexOf(userInput.toLowerCase()) === -1)
    return false;
  return true;
}

