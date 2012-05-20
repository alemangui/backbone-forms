
//==================================================================================================
//FORM
//==================================================================================================
  
var Form = (function() {

  return Backbone.View.extend({

    /**
     * @param {Object}  Options
     *      Required:
     *          schema  {Array}
     *      Optional:
     *          model   {Backbone.Model} : Use instead of data, and use commit().
     *          data    {Array} : Pass this when not using a model. Use getValue() to get out value
     *          fields  {Array} : Keys of fields to include in the form, in display order (default: all fields)
     *          fieldsets {Array} : Allows choosing and ordering fields within fieldsets.
     *          idPrefix {String} : Prefix for editor IDs. If undefined, the model's CID is used.
     *          template {String} : Template to use. Default to 'form'.
     */
    initialize: function(options) { 
      //Check templates have been loaded
      if (!Form.templates.form) throw new Error('Templates not loaded');

      //Get the schema
      this.schema = (function() {
        if (options.schema) return options.schema;
      
        var model = options.model;
        if (!model) throw new Error('Could not find schema');
      
        if (_.isFunction(model.schema)) return model.schema();
      
        return model.schema;
      })();

      //Option defaults
      options = _.extend({
        template: 'form',
        fieldTemplate: 'field',
        fieldsetTemplate: 'fieldset'
      }, options);

      //Determine fieldsets
      if (!options.fieldsets) {
        var fields = options.fields || _.keys(this.schema);

        options.fieldsets = [{ fields: fields }];
      }
      
      //Store main attributes
      this.options = options;
      this.model = options.model;
      this.data = options.data;
      this.fields = {};
    },

    /**
     * Renders the form and all fields
     */
    render: function() {
      var self = this,
          options = this.options,
          template = Form.templates[options.template];
      
      //Create el from template
      var $form = $(template({
        fieldsets: '<b class="bbf-tmp"></b>'
      }));

      //Render fieldsets
      var $fieldsetContainer = $('.bbf-tmp', $form);

      _.each(options.fieldsets, function(fieldset) {
        $fieldsetContainer.append(self.renderFieldset(fieldset));
      });

      $fieldsetContainer.children().unwrap();

      //Set the template contents as the main element; removes the wrapper element
      this.setElement($form);

      return this;
    },

    /**
     * Renders a fieldset and the fields within it
     *
     * Valid fieldset definitions:
     * ['field1', 'field2']
     * { legend: 'Some Fieldset', fields: ['field1', 'field2'] }
     *
     * @param {Object|Array} fieldset     A fieldset definition
     * 
     * @return {jQuery}                   The fieldset DOM element
     */
    renderFieldset: function(fieldset) {
      var self = this,
          template = Form.templates[this.options.fieldsetTemplate],
          schema = this.schema,
          getNested = Form.helpers.getNested;

      //Normalise to object
      if (_.isArray(fieldset)) {
        fieldset = { fields: fieldset };
      }

      //Concatenating HTML as strings won't work so we need to insert field elements into a placeholder
      var $fieldset = $(template(_.extend({}, fieldset, {
        legend: fieldset.legend || '',
        fields: '<b class="bbf-tmp"></b>'
      })));

      var $fieldsContainer = $('.bbf-tmp', $fieldset);

      //this.renderFields(fieldset.fields, $fieldsContainer);

      //Render fields
      _.each(fieldset.fields, function(key) {
        //Get the field schema
        var itemSchema = (function() {
          //Return a normal key or path key
          if (schema[key]) return schema[key];

          //Return a nested schema, i.e. Object
          var path = key.replace(/\./g, '.subSchema.');
          return getNested(schema, path);
        })();

        if (!itemSchema) throw "Field '"+key+"' not found in schema";

        //Create the field
        var field = self.fields[key] = self.createField(key, itemSchema);

        //Render the fields with editors, apart from Hidden fields
        if (schema.type == 'Hidden') {
          field.editor = Form.helpers.createEditor('Hidden', options);
        } else {
          $fieldsContainer.append(field.render().el);
        }
      });

      $fieldsContainer = $fieldsContainer.children().unwrap()

      return $fieldset;
    },

    /**
     * Renders a field and returns it
     *
     * @param {String} key            The key for the field in the form schema
     * @param {Object} schema         Field schema
     *
     * @return {Field}                The field view
     */
    createField: function(key, schema) {
      var options = {
        form: this,
        key: key,
        schema: schema,
        idPrefix: this.options.idPrefix
      };

      if (this.model) {
        options.model = this.model;
      } else if (this.data) {
        options.value = this.data[key];
      } else {
        options.value = null;
      }

      return new Form.Field(options);
    },

    /**
     * Validate the data
     *
     * @return {Object} Validation errors
     */
    validate: function() {
      var self = this,
          fields = this.fields,
          model = this.model,
          errors = {};

      //Collect errors from schema validation
      _.each(fields, function(field) {
        var error = field.validate();
        if (error) {
          errors[field.key] = error;
        }
      });

      //Get errors from default Backbone model validator
      if (model && model.validate) {
        var modelErrors = model.validate(this.getValue());
        
        if (modelErrors) {
          var isDictionary = _.isObject(modelErrors) && !_.isArray(modelErrors);
          
          //If errors are not in object form then just store on the error object
          if (!isDictionary) {
            errors._others = errors._others || [];
            errors._others.push(modelErrors);
          }
          
          //Merge programmatic errors (requires model.validate() to return an object e.g. { fieldKey: 'error' })
          if (isDictionary) {
            _.each(modelErrors, function(val, key) {
              //Set error on field if there isn't one already
              if (self.fields[key] && !errors[key]) {
                self.fields[key].setError(val);
              }
              
              else {
                //Otherwise add to '_others' key
                errors._others = errors._others || [];
                var tmpErr = {};
                tmpErr[key] = val;
                errors._others.push(tmpErr);
              }
            });
          }
        }
      }

      return _.isEmpty(errors) ? null : errors;
    },

    /**
     * Update the model with all latest values.
     *
     * @return {Object}  Validation errors
     */
    commit: function() {
      //Validate
      var errors = this.validate();
      if (errors) return errors;

      //Commit
      var modelError;
      this.model.set(this.getValue(), {
        error: function(model, e) {
          modelError = e;
        }
      });
      
      if (modelError) return modelError;
    },

    /**
     * Get all the field values as an object.
     * Use this method when passing data instead of objects
     * 
     * @param {String}  To get a specific field value pass the key name
     */
    getValue: function(key) {
      //Return only given key if specified
      if (key) return this.fields[key].getValue();
      
      //Otherwise return entire form      
      var values = {};
      _.each(this.fields, function(field) {
        values[field.key] = field.getValue();
      });

      return values;
    },
    
    /**
     * Update field values, referenced by key
     * @param {Object}  New values to set
     */
    setValue: function(data) {
      for (var key in data) {
        this.fields[key].setValue(data[key]);
      }
    },

    /**
     * Override default remove function in order to remove embedded views
     */
    remove: function() {
      var fields = this.fields;
      
      for (var key in fields) {
        fields[key].remove();
      }

      Backbone.View.prototype.remove.call(this);
    }
  });

})();
